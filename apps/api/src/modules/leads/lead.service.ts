import { prisma } from '../../database/prisma';
import { 
  CreateLeadDTO, 
  UpdateLeadMetadataDTO, 
  AssignLeadDTO, 
  RecordLeadOutcomeDTO, 
  LeadQueryDTO 
} from './lead.dto';
import { AuthUser } from '../../types/express';
import { 
  NotFoundError, 
  ForbiddenError, 
  ConflictError, 
  ValidationError 
} from '../../utils/errors';
import { 
  Role, 
  LeadStatus, 
  ObservationType, 
  EventType, 
  CaseState 
} from '@prisma/client';

export class LeadService {
  /**
   * Register a new lead or sighting for an active investigation case.
   */
  public static async createLead(caseId: string, dto: CreateLeadDTO, actorUser: AuthUser) {
    if (actorUser.role === Role.READ_ONLY_REVIEWER) {
      throw new ForbiddenError('Reviewers are not permitted to register leads');
    }

    const investigationCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!investigationCase) {
      throw new NotFoundError(`Case with ID ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== investigationCase.jurisdictionId) {
        throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
      }
    }

    if (investigationCase.caseState === CaseState.CLOSED) {
      throw new ConflictError('Cannot register new leads on a closed investigation case. Reopen the case first.');
    }

    // Validate assigned user if provided
    if (dto.assignedUserId) {
      const assignedOfficer = await prisma.user.findUnique({
        where: { id: dto.assignedUserId },
      });
      if (!assignedOfficer || !assignedOfficer.isActive) {
        throw new ValidationError('Specified assigned investigator is invalid or inactive');
      }
      if (
        assignedOfficer.jurisdictionId &&
        assignedOfficer.jurisdictionId !== investigationCase.jurisdictionId &&
        assignedOfficer.role !== Role.SYSTEM_ADMIN
      ) {
        throw new ValidationError('Assigned investigator must belong to the case jurisdiction or global scope');
      }
    }

    return await prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const count = await tx.leadSighting.count();
      let refNum = count + 1;
      let leadReference = `LED-${currentYear}-${String(refNum).padStart(4, '0')}`;

      while (await tx.leadSighting.findUnique({ where: { leadReference } })) {
        refNum++;
        leadReference = `LED-${currentYear}-${String(refNum).padStart(4, '0')}`;
      }

      const initialStatus = dto.assignedUserId ? LeadStatus.ASSIGNED : LeadStatus.NEW;

      const newLead = await tx.leadSighting.create({
        data: {
          leadReference,
          caseId,
          sourceType: dto.sourceType,
          sourceContact: dto.sourceContact || null,
          narrative: dto.narrative,
          observedAt: dto.observedAt ? new Date(dto.observedAt) : null,
          reportedAt: dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
          latitude: dto.latitude !== undefined ? dto.latitude : null,
          longitude: dto.longitude !== undefined ? dto.longitude : null,
          locationUncertaintyMeters: dto.locationUncertaintyMeters || null,
          locationDescription: dto.locationDescription || null,
          verificationStatus: initialStatus,
          assignedUserId: dto.assignedUserId || null,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      // If spatial coordinates are present, automatically register a linked LocationObservation
      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        await tx.locationObservation.create({
          data: {
            caseId,
            leadId: newLead.id,
            observationType: ObservationType.WITNESS_SIGHTING,
            sourceDescription: dto.locationDescription || `Reported sighting from lead ${leadReference}`,
            latitude: dto.latitude,
            longitude: dto.longitude,
            locationUncertaintyMeters: dto.locationUncertaintyMeters || 100.0,
            observedAt: dto.observedAt ? new Date(dto.observedAt) : new Date(),
            verificationStatus: initialStatus,
          },
        });
      }

      await tx.investigationCase.update({
        where: { id: caseId },
        data: { lastActivityAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: EventType.LEAD_REGISTERED,
          actorUserId: actorUser.id,
          description: `Lead ${leadReference} lodged via ${dto.sourceType}. Status: ${initialStatus}.`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'LEAD_CREATED',
          entityType: 'lead_sightings',
          entityId: newLead.id,
          caseId,
          newStateJson: {
            leadReference,
            sourceType: dto.sourceType,
            status: initialStatus,
            hasCoordinates: dto.latitude !== undefined && dto.longitude !== undefined,
          },
          reason: 'Initial lead lodgement',
        },
      });

      return newLead;
    });
  }

  /**
   * List leads for a specific investigation case with filtering and pagination.
   */
  public static async getLeadsForCase(caseId: string, query: LeadQueryDTO, actorUser: AuthUser) {
    const investigationCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!investigationCase) {
      throw new NotFoundError(`Case with ID ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== investigationCase.jurisdictionId) {
        throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
      }
    }

    const where: any = {
      caseId,
      ...(query.verificationStatus ? { verificationStatus: query.verificationStatus } : {}),
      ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
    };

    if (query.search) {
      where.OR = [
        { leadReference: { contains: query.search, mode: 'insensitive' } },
        { narrative: { contains: query.search, mode: 'insensitive' } },
        { locationDescription: { contains: query.search, mode: 'insensitive' } },
        { findings: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [leads, total] = await Promise.all([
      prisma.leadSighting.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { reportedAt: 'desc' },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
          _count: {
            select: {
              evidenceItems: true,
              tasks: true,
              observations: true,
            },
          },
        },
      }),
      prisma.leadSighting.count({ where }),
    ]);

    return {
      leads,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Retrieve single lead by ID with authorized relational context.
   */
  public static async getLeadById(id: string, actorUser: AuthUser) {
    const lead = await prisma.leadSighting.findUnique({
      where: { id },
      include: {
        case: {
          select: {
            id: true,
            caseReference: true,
            caseState: true,
            jurisdictionId: true,
            priority: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            displayName: true,
            badgeNumber: true,
            role: true,
            email: true,
          },
        },
        evidenceItems: {
          select: {
            id: true,
            evidenceReference: true,
            title: true,
            evidenceType: true,
            accessClassification: true,
            isVerified: true,
          },
        },
        tasks: {
          select: {
            id: true,
            taskReference: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
          },
        },
        observations: {
          select: {
            id: true,
            observationType: true,
            latitude: true,
            longitude: true,
            locationUncertaintyMeters: true,
            observedAt: true,
          },
        },
      },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== lead.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: lead belongs to a jurisdiction outside your scope');
      }
    }

    return lead;
  }

  /**
   * Update permitted non-status lead metadata.
   */
  public static async updateLeadMetadata(id: string, dto: UpdateLeadMetadataDTO, actorUser: AuthUser) {
    if (actorUser.role === Role.READ_ONLY_REVIEWER) {
      throw new ForbiddenError('Reviewers are not permitted to edit lead metadata');
    }

    const lead = await prisma.leadSighting.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== lead.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: lead belongs to a jurisdiction outside your scope');
      }
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.leadSighting.update({
        where: { id },
        data: {
          ...(dto.narrative ? { narrative: dto.narrative } : {}),
          ...(dto.sourceContact !== undefined ? { sourceContact: dto.sourceContact } : {}),
          ...(dto.locationDescription !== undefined ? { locationDescription: dto.locationDescription } : {}),
          ...(dto.findings !== undefined ? { findings: dto.findings } : {}),
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'LEAD_METADATA_UPDATED',
          entityType: 'lead_sightings',
          entityId: id,
          caseId: lead.caseId,
          newStateJson: dto,
          reason: 'Investigative metadata update',
        },
      });

      return updated;
    });
  }

  /**
   * Assign or reassign an investigator to follow up on a lead.
   */
  public static async assignLead(id: string, dto: AssignLeadDTO, actorUser: AuthUser) {
    if (actorUser.role !== Role.SUPERVISOR && actorUser.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenError('Only supervisors and administrators can assign leads');
    }

    const lead = await prisma.leadSighting.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== lead.case.jurisdictionId) {
        throw new ForbiddenError('Access denied');
      }
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: dto.assignedUserId },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new ValidationError('Target investigator is invalid or inactive');
    }

    if (
      targetUser.jurisdictionId &&
      targetUser.jurisdictionId !== lead.case.jurisdictionId &&
      targetUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ValidationError('Investigator must belong to the same jurisdiction or global system scope');
    }

    const previousAssigneeId = lead.assignedUserId;
    const nextStatus = lead.verificationStatus === LeadStatus.NEW ? LeadStatus.ASSIGNED : lead.verificationStatus;

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.leadSighting.update({
        where: { id },
        data: {
          assignedUserId: dto.assignedUserId,
          verificationStatus: nextStatus,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: lead.caseId,
          eventType: EventType.ASSIGNMENT_CHANGED,
          actorUserId: actorUser.id,
          description: `Lead ${lead.leadReference} assigned to ${targetUser.displayName} (${targetUser.badgeNumber || 'No Badge'}). Reason: ${dto.reassignmentReason || 'Supervisor tasking'}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'LEAD_ASSIGNED',
          entityType: 'lead_sightings',
          entityId: id,
          caseId: lead.caseId,
          previousStateJson: { assignedUserId: previousAssigneeId },
          newStateJson: { assignedUserId: dto.assignedUserId, status: nextStatus },
          reason: dto.reassignmentReason || 'Lead reassigned by supervisor',
        },
      });

      return updated;
    });
  }

  /**
   * Record verification outcome, vet lead credibility, or mark duplicate with provenance preservation.
   * INVARIANT: Disproving a lead NEVER closes or modifies the parent investigation case.
   */
  public static async recordVerificationOutcome(id: string, dto: RecordLeadOutcomeDTO, actorUser: AuthUser) {
    if (
      actorUser.role !== Role.CASE_OFFICER &&
      actorUser.role !== Role.SUPERVISOR &&
      actorUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ForbiddenError('Unauthorized: only sworn case officers, supervisors or administrators can record verification outcomes');
    }

    const lead = await prisma.leadSighting.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== lead.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: case jurisdiction outside scope');
      }
    }

    const currentStatus = lead.verificationStatus;
    const targetStatus = dto.verificationStatus;

    if (currentStatus === targetStatus) {
      throw new ValidationError(`Lead is already in '${targetStatus}' status`);
    }

    const terminalStatuses: LeadStatus[] = [
      LeadStatus.VERIFIED,
      LeadStatus.DISPROVED,
      LeadStatus.INCONCLUSIVE,
      LeadStatus.DUPLICATE,
    ];

    // If currently in terminal status, only SUPERVISOR or SYSTEM_ADMIN can reopen for reassessment
    if (terminalStatuses.includes(currentStatus)) {
      if (actorUser.role !== Role.SUPERVISOR && actorUser.role !== Role.SYSTEM_ADMIN) {
        throw new ForbiddenError(`Re-evaluating a closed/vetted lead from '${currentStatus}' requires supervisor authorization.`);
      }
      if (targetStatus !== LeadStatus.UNDER_REVIEW) {
        throw new ConflictError(`Terminal lead in '${currentStatus}' state must be moved to 'UNDER_REVIEW' for formal re-assessment.`);
      }
    }

    // If target is DUPLICATE, validate linked duplicate reference
    if (targetStatus === LeadStatus.DUPLICATE && dto.duplicateOfLeadId) {
      if (dto.duplicateOfLeadId === id) {
        throw new ValidationError('A lead cannot be designated as a duplicate of itself');
      }
      const canonicalLead = await prisma.leadSighting.findUnique({
        where: { id: dto.duplicateOfLeadId },
      });
      if (!canonicalLead) {
        throw new ValidationError('Referenced canonical lead does not exist');
      }
      if (canonicalLead.caseId !== lead.caseId) {
        throw new ValidationError('Duplicate lead grouping is strictly restricted to leads within the same parent case');
      }
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.leadSighting.update({
        where: { id },
        data: {
          verificationStatus: targetStatus,
          findings: dto.findings,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      // Update observation verification status if linked
      await tx.locationObservation.updateMany({
        where: { leadId: id },
        data: { verificationStatus: targetStatus },
      });

      // CRITICAL INVARIANT VERIFICATION:
      // Even if lead is DISPROVED or DUPLICATE, parent investigationCase state MUST NOT be altered!
      await tx.investigationCase.update({
        where: { id: lead.caseId },
        data: { lastActivityAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId: lead.caseId,
          eventType: EventType.LEAD_VERIFIED,
          actorUserId: actorUser.id,
          description: `Lead ${lead.leadReference} verified as '${targetStatus}'. Findings: ${dto.findings}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'LEAD_STATUS_CHANGED',
          entityType: 'lead_sightings',
          entityId: id,
          caseId: lead.caseId,
          previousStateJson: { verificationStatus: currentStatus },
          newStateJson: {
            verificationStatus: targetStatus,
            duplicateOfLeadId: dto.duplicateOfLeadId || null,
          },
          reason: dto.findings,
        },
      });

      return updated;
    });
  }
}
