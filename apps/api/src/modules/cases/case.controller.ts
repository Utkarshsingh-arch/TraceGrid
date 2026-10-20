import { Request, Response, NextFunction } from 'express';
import { CaseService } from './case.service';
import { 
  createCaseSchema, 
  updateCaseSchema, 
  updateOutcomeSchema,
  transitionStateSchema, 
  reopenCaseSchema, 
  assignCaseSchema, 
  searchRadiusSchema,
  caseQuerySchema,
  uuidParamSchema 
} from './case.dto';

export class CaseController {
  public static async createCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createCaseSchema.parse(req.body);
      const newCase = await CaseService.createCase(validated, req.user!);

      res.status(201).json({
        success: true,
        data: newCase,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getCases(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = caseQuerySchema.parse(req.query);
      const { cases, meta } = await CaseService.getCases(query, req.user!);

      res.status(200).json({
        success: true,
        data: cases,
        meta,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getCaseById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const caseRecord = await CaseService.getCaseById(id, req.user!);

      res.status(200).json({
        success: true,
        data: caseRecord,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async updateCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const validated = updateCaseSchema.parse(req.body);
      const updated = await CaseService.updateCase(id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async transitionState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const validated = transitionStateSchema.parse(req.body);
      const updated = await CaseService.transitionState(id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async reopenCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const validated = reopenCaseSchema.parse(req.body);
      const updated = await CaseService.reopenCase(id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async assignCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const validated = assignCaseSchema.parse(req.body);
      const assignment = await CaseService.assignCase(id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async updateOutcome(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const validated = updateOutcomeSchema.parse(req.body);
      const updated = await CaseService.updateOutcome(id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getEligibleAssignees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const assignees = await CaseService.getEligibleAssignees(id, req.user!);

      res.status(200).json({
        success: true,
        data: assignees,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async calculateSearchRadius(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const validated = searchRadiusSchema.parse(req.body);
      const result = await CaseService.calculateSearchRadius(id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
