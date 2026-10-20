import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service';
import {
  caseloadQuerySchema,
  trendsQuerySchema,
  tasksAnalyticsQuerySchema,
  patternAnalyticsQuerySchema,
  operationalReportQuerySchema,
} from './analytics.dto';

export class AnalyticsController {
  public static async getCaseloadSummary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = caseloadQuerySchema.parse(req.query);
      const result = await AnalyticsService.getCaseloadSummary(validated, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getActivityAndResolutionTrends(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = trendsQuerySchema.parse(req.query);
      const result = await AnalyticsService.getActivityAndResolutionTrends(validated, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getTaskBacklogMetrics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = tasksAnalyticsQuerySchema.parse(req.query);
      const result = await AnalyticsService.getTaskBacklogMetrics(validated, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getPatternReviewBacklog(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = patternAnalyticsQuerySchema.parse(req.query);
      const result = await AnalyticsService.getPatternReviewBacklog(validated, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getOperationalReport(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = operationalReportQuerySchema.parse(req.query);
      const result = await AnalyticsService.getOperationalReport(validated, req.user!);

      if (result.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="tracegrid-operations-report-${new Date().toISOString().slice(0, 10)}.csv"`
        );
        res.status(200).send(result.content);
        return;
      }

      res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      next(err);
    }
  }
}
