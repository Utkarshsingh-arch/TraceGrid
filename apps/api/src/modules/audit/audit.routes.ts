import { Router } from 'express';
import { AuditController } from './audit.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { Role } from '@prisma/client';

export const caseAuditRoutes = Router({ mergeParams: true });
caseAuditRoutes.use(authenticate);

// User-facing case timeline events
caseAuditRoutes.get('/events', AuditController.getCaseEvents);

// Restricted supervisory audit logs
caseAuditRoutes.get(
  '/audit-logs',
  requireRole(Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  AuditController.getCaseAuditLogs
);
