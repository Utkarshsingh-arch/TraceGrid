import { prisma } from '../../database/prisma';
import { 
  CreateCaseDTO, 
  UpdateCaseDTO, 
  UpdateOutcomeDTO,
  TransitionStateDTO, 
  ReopenCaseDTO, 
  AssignCaseDTO, 
  SearchRadiusDTO,
  CaseQueryDTO 
} from './case.dto';
import { AuthUser } from '../../types/express';
import { 
  NotFoundError, 
  ForbiddenError, 
  ConflictError, 
  ValidationError 
} from '../../utils/errors';
import { 
  CaseState, 
  TracingOutcome, 
  EventType, 
  Role, 
  TaskStatus, 
  AssignmentRole 
} from '@prisma/client';
import { 
  generateCirclePolygon, 
  checkObservationContradiction 
} from '../geospatial/geospatial.util';

export class CaseService {
  /**
   * Register a new investigation case and subject person profile within an atomic transaction.
   */
  public static async createCase(dto: CreateCaseDTO, actorUser: AuthUser) {
    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== dto.case.jurisdictionId) {
        throw new ForbiddenError('You can only register cases within your assigned jurisdiction scope');
      }
    }

    const jur = await prisma.jurisdiction.findUnique({
      where: { id: dto.case.jurisdictionId },
    });
    if (!jur || !jur.isActive) {
      throw new ValidationError('Specified jurisdiction is invalid or inactive');
    }

    return await prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const count = await tx.investigationCase.count();
      let refNum = count + 1;
      let caseReference = `CAS-${currentYear}-${String(refNum).padStart(4, '0')}`;
      
      while (await tx.investigationCase.findUnique({ where: { caseReference } })) {
        refNum++;
        caseReference = `CAS-${currentYear}-${String(refNum).padStart(4, '0')}`;
      }

      const syntheticId = `SYN-PER-${String(refNum).padStart(4, '0')}`;

      const personProfile = await tx.personProfile.create({
        data: {
          syntheticId,
          fullName: dto.personProfile.fullName,
          aliases: dto.personProfile.aliases,
          estimatedAge: dto.personProfile.estimatedAge,
          birthDate: dto.personProfile.birthDate ? new Date(dto.personProfile.birthDate) : null,
          biologicalSex: dto.personProfile.biologicalSex,
          identifyingFeatures: dto.personProfile.identifyingFeatures,
        },
      });

      const newCase = await tx.investigationCase.create({
        data: {
          caseReference,
          personProfileId: personProfile.id,
          jurisdictionId: dto.case.jurisdictionId,
          reportedAt: new Date(dto.case.reportedAt),
          missingSince: new Date(dto.case.missingSince),
          priority: dto.case.priority,
          incidentSummary: dto.case.incidentSummary,
          caseState: CaseState.REPORTED,
          tracingOutcome: TracingOutcome.NOT_TRACED,
        },
        include: {
          personProfile: true,
          jurisdiction: true,
        },
      });

      if (actorUser.role === Role.CASE_OFFICER) {
        await tx.caseAssignment.create({
          data: {
            caseId: newCase.id,
            userId: actorUser.id,
            assignmentRole: AssignmentRole.PRIMARY_OFFICER,
            isActive: true,
          },
        });
      }

      await tx.caseEvent.create({
        data: {
          caseId: newCase.id,
          eventType: EventType.CASE_CREATED,
          actorUserId: actorUser.id,
          description: `Investigation case formally lodged under reference ${caseReference}.`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'CASE_CREATED',
          entityType: 'investigation_cases',
          entityId: newCase.id,
          caseId: newCase.id,
          newStateJson: {
            caseReference,
            priority: newCase.priority,
            state: newCase.caseState,
            jurisdictionId: newCase.jurisdictionId,
          },
          reason: 'Initial case registration',
        },
      });

      return newCase;
    });
  }

  /**
   * List, search, filter and paginate cases with strict jurisdiction enforcement and overdue task indicators.
   */
  public static async getCases(query: CaseQueryDTO, actorUser: AuthUser) {
    let effectiveJurisdictionId: string | undefined;

    if (actorUser.role === Role.SYSTEM_ADMIN) {
      effectiveJurisdictionId = query.jurisdictionId || undefined;
    } else {
      if (!actorUser.jurisdictionId) {
        throw new ForbiddenError('Access denied: user has no assigned operational jurisdiction');
      }
      if (query.jurisdictionId && query.jurisdictionId !== actorUser.jurisdictionId) {
        throw new ForbiddenError('Access denied: You are not authorized to query cases outside your assigned jurisdiction.');
      }
      effectiveJurisdictionId = actorUser.jurisdictionId;
    }

    const where: any = {
      ...(effectiveJurisdictionId ? { jurisdictionId: effectiveJurisdictionId } : {}),
      ...(query.caseState ? { caseState: query.caseState } : {}),
      ...(query.tracingOutcome ? { tracingOutcome: query.tracingOutcome } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };

    if (query.assignedUserId) {
      where.assignments = {
        some: {
          userId: query.assignedUserId,
          isActive: true,
        },
      };
    }

    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { caseReference: { contains: search, mode: 'insensitive' } },
        { incidentSummary: { contains: search, mode: 'insensitive' } },
        { personProfile: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [cases, total] = await Promise.all([
      prisma.investigationCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy]: query.sortOrder },
        include: {
          personProfile: true,
          jurisdiction: true,
          assignments: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  badgeNumber: true,
                  role: true,
                },
              },
            },
          },
          tasks: {
            where: {
              status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
              dueDate: { lt: new Date() },
            },
            select: { id: true },
          },
          _count: {
            select: {
              leads: true,
              tasks: true,
              observations: true,
              evidence: true,
            },
          },
        },
      }),
      prisma.investigationCase.count({ where }),
    ]);

    // Format results with computed overdue action indicator
    const formattedCases = cases.map((c) => ({
      ...c,
      overdueTasksCount: c.tasks.length,
      hasOverdueActions: c.tasks.length > 0,
      tasks: undefined, // remove raw array from response
    }));

    return {
      cases: formattedCases,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieve complete authorized workspace aggregate for a single case including spatial observations & hypotheses.
   */
  public static async getCaseById(id: string, actorUser: AuthUser) {
    const caseRecord = await prisma.investigationCase.findUnique({
      where: { id },
      include: {
        personProfile: true,
        jurisdiction: true,
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                badgeNumber: true,
                role: true,
              },
            },
          },
        },
        events: {
          orderBy: { eventTimestamp: 'desc' },
          take: 40,
          include: {
            actorUser: {
              select: {
                id: true,
                displayName: true,
                role: true,
              },
            },
          },
        },
        observations: {
          orderBy: { observedAt: 'asc' },
        },
        hypotheses: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        leads: {
          take: 10,
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
          },
        },
        tasks: {
          take: 10,
          orderBy: { dueDate: 'asc' },
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
        },
        evidence: {
          take: 10,
          orderBy: { recordedAt: 'desc' },
          select: {
            id: true,
            evidenceReference: true,
            evidenceType: true,
            title: true,
            accessClassification: true,
            isVerified: true,
            recordedAt: true,
            _count: {
              select: { attachments: true },
            },
          },
        },
        _count: {
          select: {
            leads: true,
            tasks: true,
            evidence: true,
            observations: true,
          },
        },
      },
    });

    if (!caseRecord) {
      throw new NotFoundError(`Investigation case with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== caseRecord.jurisdictionId) {
        throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
      }
    }

    // Compute active overdue tasks count for workspace header indicator
    const overdueTasksCount = await prisma.investigationTask.count({
      where: {
        caseId: id,
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        dueDate: { lt: new Date() },
      },
    });

    const now = new Date();
    const formattedTasks = caseRecord.tasks.map((t) => ({
      ...t,
      isOverdue:
        now > new Date(t.dueDate) &&
        (t.status === TaskStatus.PENDING || t.status === TaskStatus.IN_PROGRESS),
    }));

    return {
      ...caseRecord,
      tasks: formattedTasks,
      overdueTasksCount,
    };
  }

  /**
   * Update permitted non-state metadata (priority, incidentSummary, missingSince).
   */
  public static async updateCase(id: string, dto: UpdateCaseDTO, actorUser: AuthUser) {
    const existing = await prisma.investigationCase.findUnique({
      where: { id },
      include: { assignments: true },
    });

    if (!existing) {
      throw new NotFoundError(`Investigation case with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== existing.jurisdictionId) {
        throw new ForbiddenError('Access denied: cannot modify a case outside your jurisdiction scope');
      }
    }

    if (actorUser.role === Role.CASE_OFFICER) {
      const isAssigned = existing.assignments.some(
        (a) => a.userId === actorUser.id && a.isActive
      );
      if (!isAssigned) {
        throw new ForbiddenError('Case officers can only edit cases to which they are actively assigned');
      }
    }

    const previousState = {
      priority: existing.priority,
      incidentSummary: existing.incidentSummary,
      missingSince: existing.missingSince,
    };

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationCase.update({
        where: { id },
        data: {
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.incidentSummary ? { incidentSummary: dto.incidentSummary } : {}),
          ...(dto.missingSince ? { missingSince: new Date(dto.missingSince) } : {}),
          lastActivityAt: new Date(),
        },
        include: {
          personProfile: true,
          jurisdiction: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'CASE_METADATA_UPDATED',
          entityType: 'investigation_cases',
          entityId: id,
          caseId: id,
          previousStateJson: previousState,
          newStateJson: {
            priority: updated.priority,
            incidentSummary: updated.incidentSummary,
            missingSince: updated.missingSince,
          },
          reason: 'Authorized case metadata update',
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: id,
          eventType: EventType.NOTE_ADDED,
          actorUserId: actorUser.id,
          description: `Case metadata updated by ${actorUser.email}.`,
        },
      });

      return updated;
    });
  }

  /**
   * Explicit authorized command to update physical tracing outcome.
   */
  public static async updateOutcome(id: string, dto: UpdateOutcomeDTO, actorUser: AuthUser) {
    const existing = await prisma.investigationCase.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Investigation case with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== existing.jurisdictionId) {
        throw new ForbiddenError('Access denied: cannot update outcome of a case outside your jurisdiction');
      }
    }

    const prevOutcome = existing.tracingOutcome;

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationCase.update({
        where: { id },
        data: {
          tracingOutcome: dto.tracingOutcome,
          lastActivityAt: new Date(),
        },
        include: {
          personProfile: true,
          jurisdiction: true,
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: id,
          eventType: EventType.OUTCOME_UPDATED,
          actorUserId: actorUser.id,
          description: `Physical tracing outcome changed from '${prevOutcome}' to '${dto.tracingOutcome}'. Notes: ${dto.notes}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'OUTCOME_UPDATED',
          entityType: 'investigation_cases',
          entityId: id,
          caseId: id,
          previousStateJson: { tracingOutcome: prevOutcome },
          newStateJson: { tracingOutcome: dto.tracingOutcome },
          reason: dto.notes,
        },
      });

      return updated;
    });
  }

  /**
   * Explicit command-style state transition with validation and task completion invariants.
   */
  public static async transitionState(id: string, dto: TransitionStateDTO, actorUser: AuthUser) {
    const existing = await prisma.investigationCase.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Investigation case with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== existing.jurisdictionId) {
        throw new ForbiddenError('Access denied: cannot transition state of a case outside your jurisdiction');
      }
    }

    const current = existing.caseState;
    const target = dto.targetState;

    if (current === target) {
      throw new ValidationError(`Case is already in state '${target}'`);
    }

    if (current === CaseState.CLOSED) {
      throw new ConflictError(
        'Closed cases cannot be transitioned directly using transition-state. Use the /reopen command endpoint.'
      );
    }

    const validTransitions: Record<CaseState, CaseState[]> = {
      [CaseState.REPORTED]: [CaseState.UNDER_REVIEW, CaseState.CLOSED],
      [CaseState.UNDER_REVIEW]: [CaseState.OPEN, CaseState.CLOSED],
      [CaseState.OPEN]: [CaseState.UNDER_REVIEW, CaseState.CLOSED],
      [CaseState.CLOSED]: [],
    };

    if (!validTransitions[current]?.includes(target)) {
      throw new ConflictError(`Invalid state transition: cannot transition case from '${current}' to '${target}'`);
    }

    if (target === CaseState.CLOSED) {
      const outstandingTasksCount = await prisma.investigationTask.count({
        where: {
          caseId: id,
          status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        },
      });

      if (outstandingTasksCount > 0) {
        throw new ConflictError(
          `Cannot close case with ${outstandingTasksCount} outstanding tasks. All pending or in-progress tasks must be explicitly completed or cancelled first.`
        );
      }
    }

    const closedAt = target === CaseState.CLOSED ? new Date() : null;
    const closureReason = target === CaseState.CLOSED ? dto.reason : existing.closureReason;

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationCase.update({
        where: { id },
        data: {
          caseState: target,
          closedAt,
          closureReason,
          lastActivityAt: new Date(),
        },
        include: {
          personProfile: true,
          jurisdiction: true,
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: id,
          eventType: EventType.STATE_TRANSITION,
          actorUserId: actorUser.id,
          description: `Case state transitioned from '${current}' to '${target}'. Reason: ${dto.reason}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: target === CaseState.CLOSED ? 'CASE_CLOSED' : 'STATE_TRANSITION',
          entityType: 'investigation_cases',
          entityId: id,
          caseId: id,
          previousStateJson: { caseState: current },
          newStateJson: { caseState: target },
          reason: dto.reason,
        },
      });

      return updated;
    });
  }

  /**
   * Explicit authorized command to reopen a closed case with justification.
   */
  public static async reopenCase(id: string, dto: ReopenCaseDTO, actorUser: AuthUser) {
    const existing = await prisma.investigationCase.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Investigation case with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== existing.jurisdictionId) {
        throw new ForbiddenError('Access denied: cannot reopen a case outside your jurisdiction');
      }
    }

    if (existing.caseState !== CaseState.CLOSED) {
      throw new ConflictError(`Cannot reopen case: current state is '${existing.caseState}'. Only CLOSED cases can be reopened.`);
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationCase.update({
        where: { id },
        data: {
          caseState: CaseState.OPEN,
          closedAt: null,
          lastActivityAt: new Date(),
        },
        include: {
          personProfile: true,
          jurisdiction: true,
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: id,
          eventType: EventType.STATE_TRANSITION,
          actorUserId: actorUser.id,
          description: `Closed investigation formally reopened by authorized supervisor. Justification: ${dto.reason}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'CASE_REOPENED',
          entityType: 'investigation_cases',
          entityId: id,
          caseId: id,
          previousStateJson: { caseState: CaseState.CLOSED, closureReason: existing.closureReason },
          newStateJson: { caseState: CaseState.OPEN },
          reason: dto.reason,
        },
      });

      return updated;
    });
  }

  /**
   * Assign or transfer investigative responsibility while preserving assignment history.
   */
  public static async assignCase(id: string, dto: AssignCaseDTO, actorUser: AuthUser) {
    const existing = await prisma.investigationCase.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Investigation case with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== existing.jurisdictionId) {
        throw new ForbiddenError('Access denied: cannot assign officers to a case outside your jurisdiction');
      }
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new ValidationError('Target officer account does not exist or is inactive');
    }

    if (
      targetUser.jurisdictionId &&
      targetUser.jurisdictionId !== existing.jurisdictionId &&
      targetUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ValidationError('Assigned officer must belong to the case jurisdiction or global system scope');
    }

    return await prisma.$transaction(async (tx) => {
      await tx.caseAssignment.updateMany({
        where: {
          caseId: id,
          assignmentRole: dto.assignmentRole,
          isActive: true,
        },
        data: {
          isActive: false,
          unassignedAt: new Date(),
          reassignmentReason: dto.reassignmentReason || 'Reassigned by supervisor',
        },
      });

      const newAssignment = await tx.caseAssignment.create({
        data: {
          caseId: id,
          userId: dto.userId,
          assignmentRole: dto.assignmentRole,
          isActive: true,
          assignedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      await tx.investigationCase.update({
        where: { id },
        data: { lastActivityAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId: id,
          eventType: EventType.ASSIGNMENT_CHANGED,
          actorUserId: actorUser.id,
          description: `Assigned ${targetUser.displayName} (${targetUser.badgeNumber || 'No Badge'}) as ${dto.assignmentRole}.`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'OFFICER_ASSIGNED',
          entityType: 'case_assignments',
          entityId: newAssignment.id,
          caseId: id,
          newStateJson: {
            assignedUserId: targetUser.id,
            role: dto.assignmentRole,
            assignedBy: actorUser.id,
          },
          reason: dto.reassignmentReason || 'Operational assignment update',
        },
      });

      return newAssignment;
    });
  }

  /**
   * Retrieve eligible officer/supervisor assignees for a case.
   */
  public static async getEligibleAssignees(id: string, actorUser: AuthUser) {
    const existing = await prisma.investigationCase.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Case ${id} not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== existing.jurisdictionId) {
        throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
      }
    }

    return await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.CASE_OFFICER, Role.SUPERVISOR] },
        OR: [
          { jurisdictionId: existing.jurisdictionId },
          { jurisdictionId: null }, // Global system users
        ],
      },
      select: {
        id: true,
        displayName: true,
        badgeNumber: true,
        role: true,
        email: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }

  /**
   * Deterministic decision-support search radius calculation and contradiction detection.
   */
  public static async calculateSearchRadius(id: string, dto: SearchRadiusDTO, actorUser: AuthUser) {
    const existing = await prisma.investigationCase.findUnique({
      where: { id },
      include: {
        observations: true,
      },
    });

    if (!existing) {
      throw new NotFoundError(`Case ${id} not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== existing.jurisdictionId) {
        throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
      }
    }

    const anchor = existing.observations.find((o) => o.id === dto.anchorObservationId);
    if (!anchor) {
      throw new ValidationError('Selected anchor observation does not belong to this case');
    }

    // Default travel speeds (km/h)
    const modeSpeedDefaults = {
      PEDESTRIAN: 4.5,
      TRANSIT: 25.0,
      VEHICULAR: 45.0,
    };

    const maxSpeedKmh = dto.maxSpeedKmh || modeSpeedDefaults[dto.assumedTravelMode];
    const analysisDate = dto.analysisTime ? new Date(dto.analysisTime) : new Date();

    // Elapsed time from anchor observation to analysis time
    const elapsedMs = Math.max(analysisDate.getTime() - anchor.observedAt.getTime(), 0);
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    // Bounded search calculation formula:
    // candidate_radius = (max_speed * elapsed_time) + anchor_uncertainty
    const travelDistanceMeters = elapsedHours * maxSpeedKmh * 1000;
    const candidateRadiusMeters = Math.min(
      Math.round(travelDistanceMeters + anchor.locationUncertaintyMeters),
      150000 // Upper bound 150 km cap to prevent global polygons
    );

    // Contradiction Analysis:
    // Evaluate other case observations against the anchor under assumed speed
    const contradictions: Array<{
      observationId: string;
      observationType: string;
      sourceDescription: string;
      distanceKm: number;
      timeDeltaHours: number;
      requiredSpeedKmh: number;
      isContradictory: boolean;
      isExcluded: boolean;
      exclusionReason?: string;
      explanation: string;
    }> = [];

    const otherObservations = existing.observations.filter((o) => o.id !== anchor.id);
    for (const obs of otherObservations) {
      const check = checkObservationContradiction(anchor, obs, maxSpeedKmh);
      const isExcluded = dto.excludedObservationIds.includes(obs.id);
      const exclusionReason = dto.exclusionReasons[obs.id] || (isExcluded ? 'Investigator excluded' : undefined);

      contradictions.push({
        observationId: obs.id,
        observationType: obs.observationType,
        sourceDescription: obs.sourceDescription,
        distanceKm: check.distanceKm,
        timeDeltaHours: check.timeDeltaHours,
        requiredSpeedKmh: check.requiredSpeedKmh,
        isContradictory: check.isContradictory,
        isExcluded,
        exclusionReason,
        explanation: check.explanation,
      });
    }

    // Generate GeoJSON Circle approximation polygon
    const polygonCoordinates = generateCirclePolygon(
      { latitude: anchor.latitude, longitude: anchor.longitude },
      candidateRadiusMeters,
      36
    );

    const geoJsonFeature = {
      type: 'Feature',
      properties: {
        anchorObservationId: anchor.id,
        assumedTravelMode: dto.assumedTravelMode,
        maxSpeedKmh,
        candidateRadiusMeters,
        elapsedHours: Math.round(elapsedHours * 10) / 10,
        createdAt: new Date().toISOString(),
      },
      geometry: {
        type: 'Polygon',
        coordinates: polygonCoordinates,
      },
    };

    const assumptions = [
      `Assumed travel mode: ${dto.assumedTravelMode} at maximum speed ${maxSpeedKmh} km/h.`,
      `Anchor observation: ${anchor.sourceDescription} (${anchor.latitude.toFixed(4)}, ${anchor.longitude.toFixed(4)}) with ${anchor.locationUncertaintyMeters}m initial spatial uncertainty.`,
      `Elapsed travel interval: ${Math.round(elapsedHours * 10) / 10} hours up to analysis timestamp.`,
      `Estimated search radius: ${candidateRadiusMeters >= 1000 ? `${(candidateRadiusMeters / 1000).toFixed(1)} km` : `${candidateRadiusMeters} m`}.`,
    ];

    if (dto.excludedObservationIds.length > 0) {
      assumptions.push(`Investigator excluded ${dto.excludedObservationIds.length} conflicting observation(s) from candidate area formulation.`);
    }

    const rationale = `Candidate search boundary generated from anchor observation. Buffer calculated deterministically as (${maxSpeedKmh} km/h × ${Math.round(elapsedHours * 10) / 10}h) + ${anchor.locationUncertaintyMeters}m spatial uncertainty. This candidate geometry represents an operational prioritisation zone and must not be interpreted as guaranteed physical presence.`;

    // Persist as SearchZoneHypothesis in database
    const savedHypothesis = await prisma.$transaction(async (tx) => {
      // Deactivate prior hypotheses
      await tx.searchZoneHypothesis.updateMany({
        where: { caseId: id, isActive: true },
        data: { isActive: false },
      });

      const hypothesis = await tx.searchZoneHypothesis.create({
        data: {
          caseId: id,
          title: `Candidate Search Zone (${dto.assumedTravelMode}) — ${anchor.sourceDescription.slice(0, 32)}`,
          supportingObservationIds: [anchor.id, ...otherObservations.filter(o => !dto.excludedObservationIds.includes(o.id)).map(o => o.id)],
          excludedObservationIds: dto.excludedObservationIds,
          geometryGeojson: geoJsonFeature as any,
          calculationMethod: `DETERMINISTIC_VELOCITY_RADIUS_${dto.assumedTravelMode}`,
          assumptions,
          humanReadableRationale: rationale,
          uncertaintyRepresentation: `Operational bounding radius: ${candidateRadiusMeters} meters around anchor observation. Non-predictive heuristic triage.`,
          isActive: true,
          createdByUserId: actorUser.id,
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: id,
          eventType: EventType.HYPOTHESIS_GENERATED,
          actorUserId: actorUser.id,
          description: `Generated search hypothesis: ${hypothesis.title} (Radius: ${candidateRadiusMeters}m).`,
        },
      });

      return hypothesis;
    });

    return {
      hypothesis: savedHypothesis,
      contradictions,
      calculationDetails: {
        anchorObservation: {
          id: anchor.id,
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          uncertaintyMeters: anchor.locationUncertaintyMeters,
          observedAt: anchor.observedAt,
          sourceDescription: anchor.sourceDescription,
        },
        assumedTravelMode: dto.assumedTravelMode,
        maxSpeedKmh,
        elapsedHours: Math.round(elapsedHours * 10) / 10,
        travelDistanceMeters: Math.round(travelDistanceMeters),
        candidateRadiusMeters,
        assumptions,
        rationale,
        warning: 'This calculated zone is an investigative search triage suggestion based on user assumptions. It has not been validated as an authoritative recovery guarantee.',
      },
    };
  }
}
