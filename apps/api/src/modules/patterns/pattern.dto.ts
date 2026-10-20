import { z } from 'zod';

export const casePatternQuerySchema = z.object({
  maxDistanceKm: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : 5.0))
    .pipe(z.number().min(0.1, 'Minimum search distance is 0.1 km').max(25.0, 'Maximum search distance is 25.0 km')),
  maxTimeDeltaHours: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : 72.0))
    .pipe(z.number().min(1.0, 'Minimum time delta is 1 hour').max(720.0, 'Maximum time delta is 720 hours (30 days)')),
  includeTemporalOverlap: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? true : val === 'true')),
  includeDescriptors: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? true : val === 'true')),
  minSignals: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1).max(3)),
});

export const casePatternBodySchema = z.object({
  maxDistanceKm: z.number().min(0.1).max(25.0).optional().default(5.0),
  maxTimeDeltaHours: z.number().min(1.0).max(720.0).optional().default(72.0),
  includeTemporalOverlap: z.boolean().optional().default(true),
  includeDescriptors: z.boolean().optional().default(true),
  minSignals: z.number().int().min(1).max(3).optional().default(1),
});

export const patternReviewSchema = z.object({
  decision: z.enum(['RELEVANT_FOR_FOLLOWUP', 'NOT_RELEVANT', 'UNDER_REVIEW'], {
    errorMap: () => ({ message: 'Decision must be one of: RELEVANT_FOR_FOLLOWUP, NOT_RELEVANT, UNDER_REVIEW' }),
  }),
  rationale: z
    .string()
    .min(5, 'Operational rationale must be at least 5 characters long')
    .max(1000, 'Operational rationale cannot exceed 1000 characters'),
});

export type CasePatternQueryInput = z.infer<typeof casePatternBodySchema>;
export type PatternReviewInput = z.infer<typeof patternReviewSchema>;
