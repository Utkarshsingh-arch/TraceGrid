import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth';

export const analyticsRoutes = Router();

// Enforce JWT authentication on all analytics routes
analyticsRoutes.use(authenticate);

// 1. Caseload summary & triage metrics
analyticsRoutes.get('/caseload', AnalyticsController.getCaseloadSummary);

// 2. Case activity & resolution trends
analyticsRoutes.get('/trends', AnalyticsController.getActivityAndResolutionTrends);

// 3. Task queue backlog & overdue metrics
analyticsRoutes.get('/tasks', AnalyticsController.getTaskBacklogMetrics);

// 4. Cross-case pattern review backlog
analyticsRoutes.get('/patterns', AnalyticsController.getPatternReviewBacklog);

// 5. Consolidated operational report (JSON & CSV)
analyticsRoutes.get('/reports/operational', AnalyticsController.getOperationalReport);
