import { Request, Response, NextFunction } from 'express';
import { GeospatialService } from './geospatial.service';
import { RecommendationService } from './recommendation.service';
import {
  CalculateSearchZoneSchema,
  ContradictionQuerySchema,
  ExcludeObservationSchema,
  ReconsiderObservationSchema,
  AcceptRecommendationSchema,
} from './geospatial.schema';

export class GeospatialController {
  /**
   * GET /api/v1/cases/:caseId/contradictions
   */
  public static async getContradictions(req: Request, res: Response, next: NextFunction) {
    try {
      const caseId = req.params.caseId || req.params.id;
      const query = ContradictionQuerySchema.parse(req.query);
      const result = await GeospatialService.analyzeCaseContradictions(caseId, query, req.user!);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cases/:caseId/search-zones
   * and POST /api/v1/cases/:id/search-radius
   */
  public static async calculateSearchZones(req: Request, res: Response, next: NextFunction) {
    try {
      const caseId = req.params.caseId || req.params.id;
      const input = CalculateSearchZoneSchema.parse(req.body);
      const result = await GeospatialService.generateSearchZones(caseId, input, req.user!);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/cases/:caseId/hypotheses
   */
  public static async getHypotheses(req: Request, res: Response, next: NextFunction) {
    try {
      const caseId = req.params.caseId || req.params.id;
      const result = await GeospatialService.getCaseHypotheses(caseId, req.user!);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cases/:caseId/observations/:observationId/exclusions
   */
  public static async excludeObservation(req: Request, res: Response, next: NextFunction) {
    try {
      const caseId = req.params.caseId || req.params.id;
      const observationId = req.params.observationId;
      const input = ExcludeObservationSchema.parse(req.body);
      const result = await GeospatialService.excludeObservation(caseId, observationId, input, req.user!);
      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cases/:caseId/observations/:observationId/reconsiderations
   */
  public static async reconsiderObservation(req: Request, res: Response, next: NextFunction) {
    try {
      const caseId = req.params.caseId || req.params.id;
      const observationId = req.params.observationId;
      const input = ReconsiderObservationSchema.parse(req.body);
      const result = await GeospatialService.reconsiderObservation(caseId, observationId, input, req.user!);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/cases/:caseId/recommendations
   */
  public static async getRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const caseId = req.params.caseId || req.params.id;
      const result = await RecommendationService.generateCaseRecommendations(caseId, req.user!);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cases/:caseId/recommendations/accept
   */
  public static async acceptRecommendation(req: Request, res: Response, next: NextFunction) {
    try {
      const caseId = req.params.caseId || req.params.id;
      const input = AcceptRecommendationSchema.parse(req.body);
      const result = await RecommendationService.acceptRecommendation(caseId, input, req.user!);
      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
