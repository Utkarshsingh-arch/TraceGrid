import { Request, Response, NextFunction } from 'express';
import { PatternService } from './pattern.service';
import {
  casePatternQuerySchema,
  casePatternBodySchema,
  patternReviewSchema,
} from './pattern.dto';
import { ValidationError } from '../../utils/errors';

export class PatternController {
  /**
   * Run or retrieve cross-case pattern analysis for an authorized case.
   */
  public static async analyzePatterns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;
      if (!caseId) {
        throw new ValidationError('Case ID is required');
      }

      let parsedInput;
      if (req.method === 'POST' && Object.keys(req.body || {}).length > 0) {
        const bodyRes = casePatternBodySchema.safeParse(req.body);
        if (!bodyRes.success) {
          throw new ValidationError(bodyRes.error.errors.map((e) => e.message).join(', '));
        }
        parsedInput = bodyRes.data;
      } else {
        const queryRes = casePatternQuerySchema.safeParse(req.query);
        if (!queryRes.success) {
          throw new ValidationError(queryRes.error.errors.map((e) => e.message).join(', '));
        }
        parsedInput = queryRes.data;
      }

      const result = await PatternService.analyzeCasePatterns(caseId, parsedInput, req.user!);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieve single explainable pattern result by pattern ID.
   */
  public static async getPatternById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId, patternId } = req.params;
      if (!caseId || !patternId) {
        throw new ValidationError('Case ID and Pattern ID are required');
      }

      const pattern = await PatternService.getCasePatternById(caseId, patternId, req.user!);

      res.status(200).json({
        success: true,
        data: pattern,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Record human review decision for a cross-case pattern.
   */
  public static async recordReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId, patternId } = req.params;
      if (!caseId || !patternId) {
        throw new ValidationError('Case ID and Pattern ID are required');
      }

      const parsed = patternReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
      }

      const result = await PatternService.recordPatternReview(caseId, patternId, parsed.data, req.user!);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
