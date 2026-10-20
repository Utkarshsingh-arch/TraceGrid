import { Router } from 'express';
import { LeadController } from './lead.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { Role } from '@prisma/client';

// Router for case-scoped lead endpoints: /api/v1/cases/:caseId/leads
export const caseLeadRoutes = Router({ mergeParams: true });
caseLeadRoutes.use(authenticate);

caseLeadRoutes.get('/', LeadController.getLeadsForCase);
caseLeadRoutes.post(
  '/',
  requireRole(Role.DATA_CLERK, Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  LeadController.createLead
);

// Router for direct lead endpoints: /api/v1/leads
export const directLeadRoutes = Router();
directLeadRoutes.use(authenticate);

directLeadRoutes.get('/:id', LeadController.getLeadById);
directLeadRoutes.patch(
  '/:id',
  requireRole(Role.DATA_CLERK, Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  LeadController.updateLeadMetadata
);
directLeadRoutes.post(
  '/:id/assignments',
  requireRole(Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  LeadController.assignLead
);
directLeadRoutes.post(
  '/:id/verification-outcome',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  LeadController.recordVerificationOutcome
);
