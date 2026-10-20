import { Router } from 'express';
import { CaseController } from './case.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

// Apply global authentication to all case endpoints
router.use(authenticate);

// List cases (all roles, jurisdiction-scoped)
router.get('/', CaseController.getCases);

// Register new case & person profile
router.post(
  '/',
  requireRole(Role.DATA_CLERK, Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  CaseController.createCase
);

// Retrieve full case workspace details
router.get('/:id', CaseController.getCaseById);

// Update permitted non-state metadata
router.patch(
  '/:id',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  CaseController.updateCase
);

// Explicit state transition command
router.post(
  '/:id/transition-state',
  requireRole(Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  CaseController.transitionState
);

// Explicit authorized reopening command
router.post(
  '/:id/reopen',
  requireRole(Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  CaseController.reopenCase
);

// Assign or transfer responsibility
router.post(
  '/:id/assignments',
  requireRole(Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  CaseController.assignCase
);

// Get eligible assignees for case transfer
router.get(
  '/:id/eligible-assignees',
  CaseController.getEligibleAssignees
);

// Update physical tracing outcome
router.post(
  '/:id/update-outcome',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  CaseController.updateOutcome
);

// Calculate search radius hypothesis and contradiction analysis
router.post(
  '/:id/search-radius',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  CaseController.calculateSearchRadius
);

export const caseRoutes = router;
