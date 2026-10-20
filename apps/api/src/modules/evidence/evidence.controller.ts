import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { EvidenceService } from './evidence.service';
import { 
  createEvidenceSchema, 
  updateEvidenceSchema, 
  evidenceQuerySchema 
} from './evidence.dto';
import { ValidationError } from '../../utils/errors';
import { env } from '../../config/env';

// Configure multer memory storage with strict 10 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_BYTES, // 10 MB
  },
});

export const attachmentUploadMiddleware = upload.single('file');

export class EvidenceController {
  public static async createEvidence(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createEvidenceSchema.parse(req.body);
      const caseId = req.params.caseId;
      const evidence = await EvidenceService.createEvidence(caseId, validated, req.user!);

      res.status(201).json({
        success: true,
        data: evidence,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getEvidenceForCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = evidenceQuerySchema.parse(req.query);
      const caseId = req.params.caseId;
      const { evidence, meta } = await EvidenceService.getEvidenceForCase(caseId, query, req.user!);

      res.status(200).json({
        success: true,
        data: evidence,
        meta,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getEvidenceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const evidence = await EvidenceService.getEvidenceById(req.params.id, req.user!);

      res.status(200).json({
        success: true,
        data: evidence,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async updateEvidence(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = updateEvidenceSchema.parse(req.body);
      const updated = await EvidenceService.updateEvidence(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async uploadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new ValidationError('No file was provided in the multipart request');
      }

      const attachment = await EvidenceService.uploadAttachment(req.params.id, req.file, req.user!);

      res.status(201).json({
        success: true,
        data: attachment,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getAttachmentMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metadata = await EvidenceService.getAttachmentMetadata(req.params.id, req.user!);

      res.status(200).json({
        success: true,
        data: metadata,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async streamAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { buffer, mimeType, originalFileName, fileSizeBytes } =
        await EvidenceService.streamAttachment(req.params.id, req.user!);

      const safeAsciiName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', fileSizeBytes);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(originalFileName)}`
      );

      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
}
