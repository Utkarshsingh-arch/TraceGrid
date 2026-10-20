import { z } from 'zod';
import { CaseState, Priority, TracingOutcome, TaskStatus } from '@prisma/client';

export const dateStringSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const caseloadQuerySchema = z.object({
  jurisdictionId: z.string().uuid().optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

export type CaseloadQueryInput = z.infer<typeof caseloadQuerySchema>;

export const trendsQuerySchema = z.object({
  jurisdictionId: z.string().uuid().optional(),
  windowDays: z.coerce.number().int().min(1).max(365).optional().default(30),
  bucket: z.enum(['day', 'week', 'month']).optional().default('day'),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

export type TrendsQueryInput = z.infer<typeof trendsQuerySchema>;

export const tasksAnalyticsQuerySchema = z.object({
  jurisdictionId: z.string().uuid().optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

export type TasksAnalyticsQueryInput = z.infer<typeof tasksAnalyticsQuerySchema>;

export const patternAnalyticsQuerySchema = z.object({
  jurisdictionId: z.string().uuid().optional(),
  maxDistanceKm: z.coerce.number().min(0.1).max(25.0).optional(),
  maxTimeDeltaHours: z.coerce.number().min(1).max(720).optional(),
});

export type PatternAnalyticsQueryInput = z.infer<typeof patternAnalyticsQuerySchema>;

export const operationalReportQuerySchema = z.object({
  jurisdictionId: z.string().uuid().optional(),
  windowDays: z.coerce.number().int().min(1).max(365).optional().default(30),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

export type OperationalReportQueryInput = z.infer<typeof operationalReportQuerySchema>;
