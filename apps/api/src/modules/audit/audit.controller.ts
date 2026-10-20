import { Request, Response, NextFunction } from 'express';
import { AuditService } from './audit.service';

export class AuditController {
  public static async getCaseEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const events = await AuditService.getCaseEvents(req.params.caseId, req.user!);
      res.status(200).json({
        success: true,
        data: events,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getCaseAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const logs = await AuditService.getCaseAuditLogs(req.params.caseId, req.user!);
      res.status(200).json({
        success: true,
        data: logs,
      });
    } catch (err) {
      next(err);
    }
  }
}
