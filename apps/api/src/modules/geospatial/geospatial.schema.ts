import { z } from 'zod';

export const TravelModeSchema = z.enum(['PEDESTRIAN', 'TRANSIT', 'VEHICULAR']);

export const CalculateSearchZoneSchema = z.object({
  anchorObservationId: z.string().uuid('Invalid anchor observation UUID').optional(),
  assumedTravelMode: TravelModeSchema.default('PEDESTRIAN'),
  maxSpeedKmh: z.number().positive('Speed must be positive').max(300, 'Speed must not exceed 300 km/h').optional(),
  analysisTime: z.string().datetime('Analysis time must be a valid ISO-8601 timestamp string').optional(),
  selectedObservationIds: z.array(z.string().uuid()).optional(),
  excludedObservationIds: z.array(z.string().uuid()).default([]),
  exclusionReasons: z.record(z.string(), z.string()).default({}),
  generateAlternateHypotheses: z.boolean().default(true),
});

export type CalculateSearchZoneInput = z.infer<typeof CalculateSearchZoneSchema>;

export const ContradictionQuerySchema = z.object({
  assumedTravelMode: TravelModeSchema.default('PEDESTRIAN'),
  maxSpeedKmh: z.coerce.number().positive().max(300).optional(),
  primaryAnchorId: z.string().uuid().optional(),
});

export type ContradictionQueryInput = z.infer<typeof ContradictionQuerySchema>;

export const ExcludeObservationSchema = z.object({
  reason: z.string().min(5, 'Exclusion reason must be at least 5 characters long').max(500),
  hypothesisId: z.string().uuid('Invalid hypothesis UUID').optional(),
  isCaseLevel: z.boolean().default(false),
});

export type ExcludeObservationInput = z.infer<typeof ExcludeObservationSchema>;

export const ReconsiderObservationSchema = z.object({
  reason: z.string().min(5, 'Reconsideration justification must be at least 5 characters long').max(500),
});

export type ReconsiderObservationInput = z.infer<typeof ReconsiderObservationSchema>;

export const AcceptRecommendationSchema = z.object({
  recommendationId: z.string().min(1, 'Recommendation ID is required'),
  title: z.string().min(3, 'Task title must be at least 3 characters').max(128),
  description: z.string().min(5, 'Task description must be at least 5 characters'),
  dueDate: z.string().datetime('Due date must be a valid ISO timestamp'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assignedUserId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
});

export type AcceptRecommendationInput = z.infer<typeof AcceptRecommendationSchema>;
