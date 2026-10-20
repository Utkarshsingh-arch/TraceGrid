import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { healthRoutes } from './modules/health/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { caseRoutes } from './modules/cases/case.routes';
import { jurisdictionRoutes } from './modules/jurisdictions/jurisdiction.routes';
import { caseLeadRoutes, directLeadRoutes } from './modules/leads/lead.routes';
import { caseTaskRoutes, directTaskRoutes } from './modules/tasks/task.routes';
import { caseEvidenceRoutes, directEvidenceRoutes, attachmentRoutes } from './modules/evidence/evidence.routes';
import { caseAuditRoutes } from './modules/audit/audit.routes';
import { caseGeospatialRoutes } from './modules/geospatial/geospatial.routes';
import { casePatternRoutes } from './modules/patterns/pattern.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { NotFoundError } from './utils/errors';

export function createApp(): Application {
  const app: Application = express();

  // Attach correlation ID to every incoming request
  app.use(requestIdMiddleware);

  // Configure reverse proxy trust based on environment configuration
  if (env.TRUST_PROXY === 'true') {
    app.set('trust proxy', true);
  } else if (env.TRUST_PROXY === 'false') {
    app.set('trust proxy', false);
  } else {
    app.set('trust proxy', env.TRUST_PROXY);
  }

  // Basic security headers
  app.use(helmet());

  // Configurable CORS support (handles single or comma-separated origins)
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, or same-origin reverse proxy)
        if (!requestOrigin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS policy rejection: Origin ${requestOrigin} not permitted`));
      },
      credentials: true,
    })
  );

  // Bounded JSON and URL-encoded request body parsing (protects against memory exhaustion)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Root landing check
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'TraceGrid API',
      description: 'TraceGrid — Investigation Operations Dashboard API Service',
      version: '0.1.0',
      status: 'active',
      endpoints: {
        health: '/api/health',
        auth: '/api/v1/auth',
        cases: '/api/v1/cases',
        jurisdictions: '/api/v1/jurisdictions',
        leads: '/api/v1/leads',
        tasks: '/api/v1/tasks',
        evidence: '/api/v1/evidence',
        attachments: '/api/v1/attachments',
      },
    });
  });

  // Operational Health routes
  app.use('/api', healthRoutes);
  app.use(healthRoutes);

  // API v1 Domain Modules
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/jurisdictions', jurisdictionRoutes);

  // Leads & Sightings
  app.use('/api/v1/cases/:caseId/leads', caseLeadRoutes);
  app.use('/api/v1/leads', directLeadRoutes);

  // Investigation Tasks
  app.use('/api/v1/cases/:caseId/tasks', caseTaskRoutes);
  app.use('/api/v1/tasks', directTaskRoutes);

  // Evidence & Attachments
  app.use('/api/v1/cases/:caseId/evidence', caseEvidenceRoutes);
  app.use('/api/v1/evidence', directEvidenceRoutes);
  app.use('/api/v1/attachments', attachmentRoutes);

  // Case Events & Audit Logs
  app.use('/api/v1/cases/:caseId', caseAuditRoutes);

  // Geospatial Intelligence & Investigation Coordination
  app.use('/api/v1/cases/:caseId', caseGeospatialRoutes);

  // Cross-Case Pattern Analysis
  app.use('/api/v1/cases/:caseId/patterns', casePatternRoutes);

  // Operations Analytics & Reporting
  app.use('/api/v1/analytics', analyticsRoutes);

  // Core Cases
  app.use('/api/v1/cases', caseRoutes);

  // 404 Not Found Handler
  app.use((req: Request, _res: Response, next) => {
    next(new NotFoundError(`Endpoint not found: ${req.method} ${req.originalUrl}`));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
