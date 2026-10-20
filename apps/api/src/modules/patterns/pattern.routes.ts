import { Router } from 'express';
import { PatternController } from './pattern.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { Role } from '@prisma/client';

const router = Router({ mergeParams: true });

// Require authentication across all cross-case pattern routes
router.use(authenticate);

// Run or query cross-case pattern analysis for an authorized case
router.get('/', PatternController.analyzePatterns);
router.post('/analyze', PatternController.analyzePatterns);

// Retrieve details for a specific pattern identifier
router.get('/:patternId', PatternController.getPatternById);

// Record human review decision for an association
router.post(
  '/:patternId/review',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  PatternController.recordReview
);

export const casePatternRoutes = router;
