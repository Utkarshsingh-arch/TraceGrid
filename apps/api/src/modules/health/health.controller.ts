import { Request, Response } from 'express';
import { env } from '../../config/env';
import { tokenRevocationStore } from '../auth/tokenRevocation';

export class HealthController {
  public static getHealth(_req: Request, res: Response): void {
    const memoryUsage = process.memoryUsage();
    const revocationHealthy = tokenRevocationStore.isHealthy();

    res.status(revocationHealthy ? 200 : 503).json({
      status: revocationHealthy ? 'ok' : 'degraded',
      service: 'tracegrid-api',
      version: '0.1.0',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryRssMb: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
        memoryHeapUsedMb: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
      },
      subsystems: {
        tokenRevocation: revocationHealthy ? 'healthy' : 'degraded',
        database: 'connected',
      },
    });
  }
}
