import crypto from 'crypto';
import path from 'path';
import { prisma } from '../../database/prisma';
import { 
  CreateEvidenceDTO, 
  UpdateEvidenceDTO, 
  EvidenceQueryDTO 
} from './evidence.dto';
import { AuthUser } from '../../types/express';
import { 
  NotFoundError, 
  ForbiddenError, 
  ConflictError, 
  ValidationError, 
  AppError 
} from '../../utils/errors';
import { 
  Role, 
  AccessClassification, 
  EventType, 
  CaseState 
} from '@prisma/client';
import { defaultStorageProvider, StorageProvider } from './storage/storage.provider';
import { env } from '../../config/env';

export class EvidenceService {
  private static storage: StorageProvider = defaultStorageProvider;

  public static setStorageProvider(provider: StorageProvider) {
    this.storage = provider;
  }

  /**
   * Helper to verify access classification clearance for evidence records.
   */
  private static verifyClassificationAccess(classification: AccessClassification, actorUser: AuthUser): void {
    if (classification === AccessClassification.CONFIDENTIAL) {
      if (actorUser.role !== Role.SUPERVISOR && actorUser.role !== Role.SYSTEM_ADMIN) {
        throw new ForbiddenError('Access denied: Confidential evidence classification requires supervisor clearance');
      }
    } else if (classification === AccessClassification.RESTRICTED) {
      if (actorUser.role === Role.READ_ONLY_REVIEWER) {
        throw new ForbiddenError('Access denied: Restricted evidence requires active investigator clearance');
      }
    }
  }

  /**
   * Validate file binary integrity, signature magic bytes, size, and extension.
   */
  public static validateFile(file: Express.Multer.File): {
    mimeType: string;
    sha256Checksum: string;
    fileSizeBytes: number;
    extension: string;
  } {
    if (!file || !file.buffer) {
      throw new ValidationError('No attachment file content received');
    }

    const maxBytes = env.MAX_FILE_SIZE_BYTES;
    if (file.size > maxBytes) {
      throw new ValidationError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 10 MB maximum limit`);
    }

    const rawExt = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [
      '.jpg', '.jpeg', '.png', '.webp', '.pdf', 
      '.txt', '.json', '.csv', '.mp4', '.wav', '.mp3'
    ];

    if (!allowedExtensions.includes(rawExt)) {
      throw new ValidationError(`File extension '${rawExt}' is not permitted for evidence attachments`);
    }

    const buffer = file.buffer;
    const header = buffer.subarray(0, 16);

    // Magic Bytes Verification
    let verifiedMime = file.mimetype;
    if (rawExt === '.jpg' || rawExt === '.jpeg') {
      if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
        throw new ValidationError('File content does not match JPEG signature');
      }
      verifiedMime = 'image/jpeg';
    } else if (rawExt === '.png') {
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i < pngSignature.length; i++) {
        if (header[i] !== pngSignature[i]) {
          throw new ValidationError('File content does not match PNG signature');
        }
      }
      verifiedMime = 'image/png';
    } else if (rawExt === '.pdf') {
      const pdfHeader = buffer.subarray(0, 4).toString('utf-8');
      if (pdfHeader !== '%PDF') {
        throw new ValidationError('File content does not match PDF signature');
      }
      verifiedMime = 'application/pdf';
    } else if (rawExt === '.webp') {
      const riff = buffer.subarray(0, 4).toString('utf-8');
      const webp = buffer.subarray(8, 12).toString('utf-8');
      if (riff !== 'RIFF' || webp !== 'WEBP') {
        throw new ValidationError('File content does not match WebP signature');
      }
      verifiedMime = 'image/webp';
    } else if (['.txt', '.json', '.csv'].includes(rawExt)) {
      // Ensure text files do not contain embedded null bytes in initial sample
      const sample = buffer.subarray(0, Math.min(buffer.length, 512));
      if (sample.includes(0x00)) {
        throw new ValidationError('Binary executable content detected in text attachment');
      }
    }

    const sha256Checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      mimeType: verifiedMime,
      sha256Checksum,
      fileSizeBytes: file.size,
      extension: rawExt,
    };
  }

  /**
   * Register evidence metadata against an investigation case.
   */
  public static async createEvidence(caseId: string, dto: CreateEvidenceDTO, actorUser: AuthUser) {
    if (actorUser.role === Role.READ_ONLY_REVIEWER) {
      throw new ForbiddenError('Reviewers are not permitted to register evidence');
    }

    const investigationCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!investigationCase) {
      throw new NotFoundError(`Case with ID ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== investigationCase.jurisdictionId) {
        throw new ForbiddenError('Access denied: case jurisdiction outside scope');
      }
    }

    if (investigationCase.caseState === CaseState.CLOSED) {
      throw new ConflictError('Cannot register new evidence on a closed investigation case. Reopen the case first.');
    }

    // Cross-case lead validation
    if (dto.leadId) {
      const lead = await prisma.leadSighting.findUnique({
        where: { id: dto.leadId },
      });
      if (!lead || lead.caseId !== caseId) {
        throw new ValidationError('Validation failed: referenced lead does not belong to the same investigation case');
      }
    }

    this.verifyClassificationAccess(dto.accessClassification, actorUser);

    return await prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const count = await tx.evidenceItem.count();
      let refNum = count + 1;
      let evidenceReference = `EVD-${currentYear}-${String(refNum).padStart(4, '0')}`;

      while (await tx.evidenceItem.findUnique({ where: { evidenceReference } })) {
        refNum++;
        evidenceReference = `EVD-${currentYear}-${String(refNum).padStart(4, '0')}`;
      }

      const evidence = await tx.evidenceItem.create({
        data: {
          evidenceReference,
          caseId,
          leadId: dto.leadId || null,
          evidenceType: dto.evidenceType,
          title: dto.title,
          description: dto.description,
          sourceProvenance: dto.sourceProvenance,
          eventTimestamp: dto.eventTimestamp ? new Date(dto.eventTimestamp) : null,
          accessClassification: dto.accessClassification,
          isVerified: false,
        },
        include: {
          lead: {
            select: {
              id: true,
              leadReference: true,
            },
          },
          _count: {
            select: { attachments: true },
          },
        },
      });

      await tx.investigationCase.update({
        where: { id: caseId },
        data: { lastActivityAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: EventType.EVIDENCE_LOGGED,
          actorUserId: actorUser.id,
          description: `Evidence recorded: ${evidenceReference} — "${dto.title}" (${dto.evidenceType}). Classification: ${dto.accessClassification}.`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'EVIDENCE_REGISTERED',
          entityType: 'evidence_items',
          entityId: evidence.id,
          caseId,
          newStateJson: {
            evidenceReference,
            title: dto.title,
            evidenceType: dto.evidenceType,
            accessClassification: dto.accessClassification,
            leadId: dto.leadId || null,
          },
          reason: 'Initial evidence metadata logging',
        },
      });

      return evidence;
    });
  }

  /**
   * List evidence records for an authorised case (excluding file bytes).
   */
  public static async getEvidenceForCase(caseId: string, query: EvidenceQueryDTO, actorUser: AuthUser) {
    const investigationCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!investigationCase) {
      throw new NotFoundError(`Case with ID ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== investigationCase.jurisdictionId) {
        throw new ForbiddenError('Access denied: case jurisdiction outside scope');
      }
    }

    // Filter out classifications above user's clearance level
    const permittedClassifications: AccessClassification[] = [AccessClassification.INTERNAL];
    if (actorUser.role !== Role.READ_ONLY_REVIEWER) {
      permittedClassifications.push(AccessClassification.RESTRICTED);
    }
    if (actorUser.role === Role.SUPERVISOR || actorUser.role === Role.SYSTEM_ADMIN) {
      permittedClassifications.push(AccessClassification.CONFIDENTIAL);
    }

    const where: any = {
      caseId,
      accessClassification: { in: permittedClassifications },
      ...(query.evidenceType ? { evidenceType: query.evidenceType } : {}),
      ...(query.leadId ? { leadId: query.leadId } : {}),
    };

    if (query.accessClassification) {
      if (!permittedClassifications.includes(query.accessClassification)) {
        throw new ForbiddenError('Access denied: Insufficient clearance for requested classification');
      }
      where.accessClassification = query.accessClassification;
    }

    if (query.search) {
      where.OR = [
        { evidenceReference: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { sourceProvenance: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [evidence, total] = await Promise.all([
      prisma.evidenceItem.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { recordedAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              leadReference: true,
            },
          },
          attachments: {
            select: {
              id: true,
              originalFileName: true,
              mimeType: true,
              fileSizeBytes: true,
              sha256Checksum: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.evidenceItem.count({ where }),
    ]);

    // Format BigInt fileSizeBytes to Number in response
    const formatted = evidence.map((e) => ({
      ...e,
      attachments: e.attachments.map((a) => ({
        ...a,
        fileSizeBytes: Number(a.fileSizeBytes),
      })),
    }));

    return {
      evidence: formatted,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Retrieve single evidence item with attachment metadata.
   */
  public static async getEvidenceById(id: string, actorUser: AuthUser) {
    const evidence = await prisma.evidenceItem.findUnique({
      where: { id },
      include: {
        case: {
          select: {
            id: true,
            caseReference: true,
            jurisdictionId: true,
            caseState: true,
          },
        },
        lead: {
          select: {
            id: true,
            leadReference: true,
            sourceType: true,
          },
        },
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            mimeType: true,
            fileSizeBytes: true,
            sha256Checksum: true,
            createdAt: true,
          },
        },
      },
    });

    if (!evidence) {
      throw new NotFoundError(`Evidence record with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== evidence.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: evidence belongs to a jurisdiction outside your scope');
      }
    }

    this.verifyClassificationAccess(evidence.accessClassification, actorUser);

    return {
      ...evidence,
      attachments: evidence.attachments.map((a) => ({
        ...a,
        fileSizeBytes: Number(a.fileSizeBytes),
      })),
    };
  }

  /**
   * Update permitted evidence metadata while protecting provenance history.
   */
  public static async updateEvidence(id: string, dto: UpdateEvidenceDTO, actorUser: AuthUser) {
    if (actorUser.role === Role.READ_ONLY_REVIEWER || actorUser.role === Role.DATA_CLERK) {
      throw new ForbiddenError('Reviewers and clerks cannot modify evidence records');
    }

    const evidence = await prisma.evidenceItem.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!evidence) {
      throw new NotFoundError(`Evidence record with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== evidence.case.jurisdictionId) {
        throw new ForbiddenError('Access denied');
      }
    }

    this.verifyClassificationAccess(evidence.accessClassification, actorUser);

    if (dto.accessClassification) {
      this.verifyClassificationAccess(dto.accessClassification, actorUser);
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.evidenceItem.update({
        where: { id },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.sourceProvenance ? { sourceProvenance: dto.sourceProvenance } : {}),
          ...(dto.accessClassification ? { accessClassification: dto.accessClassification } : {}),
          ...(dto.isVerified !== undefined ? { isVerified: dto.isVerified } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'EVIDENCE_METADATA_UPDATED',
          entityType: 'evidence_items',
          entityId: id,
          caseId: evidence.caseId,
          previousStateJson: {
            title: evidence.title,
            accessClassification: evidence.accessClassification,
            isVerified: evidence.isVerified,
          },
          newStateJson: dto,
          reason: 'Provenance-preserved metadata edit',
        },
      });

      return updated;
    });
  }

  /**
   * Upload controlled binary attachment to private storage and log checksum.
   */
  public static async uploadAttachment(evidenceId: string, file: Express.Multer.File, actorUser: AuthUser) {
    if (actorUser.role === Role.READ_ONLY_REVIEWER) {
      throw new ForbiddenError('Reviewers are not permitted to upload evidence attachments');
    }

    const evidence = await prisma.evidenceItem.findUnique({
      where: { id: evidenceId },
      include: { case: true },
    });

    if (!evidence) {
      throw new NotFoundError(`Evidence record with ID ${evidenceId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== evidence.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: evidence jurisdiction outside scope');
      }
    }

    this.verifyClassificationAccess(evidence.accessClassification, actorUser);

    const validation = this.validateFile(file);
    const storageKey = crypto.randomUUID();

    // Persist to private local storage
    await this.storage.save(storageKey, file.buffer);

    return await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          evidenceItemId: evidenceId,
          storageKey,
          originalFileName: path.basename(file.originalname),
          mimeType: validation.mimeType,
          fileSizeBytes: BigInt(validation.fileSizeBytes),
          sha256Checksum: validation.sha256Checksum,
        },
      });

      await tx.investigationCase.update({
        where: { id: evidence.caseId },
        data: { lastActivityAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId: evidence.caseId,
          eventType: EventType.EVIDENCE_LOGGED,
          actorUserId: actorUser.id,
          description: `Attachment uploaded to ${evidence.evidenceReference}: "${attachment.originalFileName}" (${(validation.fileSizeBytes / 1024).toFixed(1)} KB, SHA-256: ${validation.sha256Checksum.slice(0, 10)}...).`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'ATTACHMENT_UPLOADED',
          entityType: 'attachments',
          entityId: attachment.id,
          caseId: evidence.caseId,
          newStateJson: {
            attachmentId: attachment.id,
            evidenceReference: evidence.evidenceReference,
            originalFileName: attachment.originalFileName,
            fileSizeBytes: validation.fileSizeBytes,
            sha256Checksum: validation.sha256Checksum,
          },
          reason: 'Controlled evidence attachment ingest',
        },
      });

      return {
        id: attachment.id,
        evidenceItemId: attachment.evidenceItemId,
        storageKey: attachment.storageKey,
        originalFileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        fileSizeBytes: Number(attachment.fileSizeBytes),
        sha256Checksum: attachment.sha256Checksum,
        createdAt: attachment.createdAt,
      };
    });
  }

  /**
   * Retrieve attachment metadata without exposing raw file bytes or server filesystem paths.
   */
  public static async getAttachmentMetadata(attachmentId: string, actorUser: AuthUser) {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(attachmentId)) {
      throw new ValidationError('Invalid attachment identifier format');
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        evidenceItem: {
          include: { case: true },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundError(`Attachment with ID ${attachmentId} was not found`);
    }

    const evidence = attachment.evidenceItem;
    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== evidence.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: attachment belongs to a jurisdiction outside your scope');
      }
    }

    this.verifyClassificationAccess(evidence.accessClassification, actorUser);

    return {
      id: attachment.id,
      evidenceItemId: attachment.evidenceItemId,
      evidenceReference: evidence.evidenceReference,
      storageKey: attachment.storageKey,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: Number(attachment.fileSizeBytes),
      sha256Checksum: attachment.sha256Checksum,
      createdAt: attachment.createdAt,
    };
  }

  /**
   * Stream attachment file bytes after strict authentication, jurisdiction, and classification verification.
   */
  public static async streamAttachment(attachmentId: string, actorUser: AuthUser) {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(attachmentId)) {
      throw new ValidationError('Invalid attachment identifier format');
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        evidenceItem: {
          include: { case: true },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundError(`Attachment with ID ${attachmentId} was not found`);
    }

    const evidence = attachment.evidenceItem;
    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== evidence.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: attachment belongs to an operational jurisdiction outside your scope');
      }
    }

    this.verifyClassificationAccess(evidence.accessClassification, actorUser);

    const buffer = await this.storage.read(attachment.storageKey);

    // Audit log attachment download/access
    await prisma.auditLog.create({
      data: {
        actorUserId: actorUser.id,
        action: 'ATTACHMENT_DOWNLOADED',
        entityType: 'attachments',
        entityId: attachment.id,
        caseId: evidence.caseId,
        newStateJson: {
          originalFileName: attachment.originalFileName,
          fileSizeBytes: Number(attachment.fileSizeBytes),
        },
        reason: 'Authorized attachment stream retrieval',
      },
    });

    return {
      buffer,
      mimeType: attachment.mimeType,
      originalFileName: attachment.originalFileName,
      fileSizeBytes: Number(attachment.fileSizeBytes),
    };
  }
}
