import { Request, Response, NextFunction } from 'express';
import { LeadService } from './lead.service';
import { 
  createLeadSchema, 
  updateLeadMetadataSchema, 
  assignLeadSchema, 
  recordLeadOutcomeSchema, 
  leadQuerySchema 
} from './lead.dto';

export class LeadController {
  public static async createLead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createLeadSchema.parse(req.body);
      const caseId = req.params.caseId;
      const lead = await LeadService.createLead(caseId, validated, req.user!);

      res.status(201).json({
        success: true,
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getLeadsForCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = leadQuerySchema.parse(req.query);
      const caseId = req.params.caseId;
      const { leads, meta } = await LeadService.getLeadsForCase(caseId, query, req.user!);

      res.status(200).json({
        success: true,
        data: leads,
        meta,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getLeadById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.user!);

      res.status(200).json({
        success: true,
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async updateLeadMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = updateLeadMetadataSchema.parse(req.body);
      const updated = await LeadService.updateLeadMetadata(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async assignLead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = assignLeadSchema.parse(req.body);
      const updated = await LeadService.assignLead(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async recordVerificationOutcome(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = recordLeadOutcomeSchema.parse(req.body);
      const updated = await LeadService.recordVerificationOutcome(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}
