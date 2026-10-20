import { prisma } from '../../database/prisma';
import { AuthUser } from '../../types/express';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { Role } from '@prisma/client';

export class AuditService {
  /**
   * Retrieve user-facing chronological case timeline events.
   */
  public static async getCaseEvents(caseId: string, actorUser: AuthUser) {
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

    return await prisma.caseEvent.findMany({
      where: { caseId },
      orderBy: { eventTimestamp: 'desc' },
      take: 100,
      include: {
        actorUser: {
          select: {
            id: true,
            displayName: true,
            badgeNumber: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Retrieve restricted, tamper-evident audit logs.
   * Access is strictly restricted to SUPERVISOR and SYSTEM_ADMIN roles.
   */
  public static async getCaseAuditLogs(caseId: string, actorUser: AuthUser) {
    if (actorUser.role !== Role.SUPERVISOR && actorUser.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenError('Access denied: Audit log retrieval requires supervisory or administrative clearance');
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

    return await prisma.auditLog.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            displayName: true,
            badgeNumber: true,
            role: true,
          },
        },
      },
    });
  }
}
