import { Router } from 'express';
import { GeospatialController } from './geospatial.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { Role } from '@prisma/client';

const router = Router({ mergeParams: true });

// Require authentication across all geospatial and coordination routes
router.use(authenticate);

// Contradiction analysis across case observations
router.get('/contradictions', GeospatialController.getContradictions);

// Search zone hypothesis generation
router.post(
  '/search-zones',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  GeospatialController.calculateSearchZones
);

// Backward compatible alias: search-radius
router.post(
  '/search-radius',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  GeospatialController.calculateSearchZones
);

// Prior search zone hypotheses
router.get('/hypotheses', GeospatialController.getHypotheses);

// Observation exclusion and reconsideration
router.post(
  '/observations/:observationId/exclusions',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  GeospatialController.excludeObservation
);

router.post(
  '/observations/:observationId/reconsiderations',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  GeospatialController.reconsiderObservation
);

// Investigation coordination: task recommendations
router.get('/recommendations', GeospatialController.getRecommendations);

router.post(
  '/recommendations/accept',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  GeospatialController.acceptRecommendation
);

export const caseGeospatialRoutes = router;
