import { z } from 'zod';
import { BiologicalSex, Priority, CaseState, TracingOutcome, AssignmentRole } from '@prisma/client';

export const createCaseSchema = z.object({
  personProfile: z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(128),
    aliases: z.array(z.string()).default([]),
    estimatedAge: z.number().int().min(1).max(120).optional().nullable(),
    birthDate: z.string().datetime().optional().nullable(),
    biologicalSex: z.nativeEnum(BiologicalSex).default(BiologicalSex.UNKNOWN),
    identifyingFeatures: z.string().optional().nullable(),
  }),
  case: z.object({
    jurisdictionId: z.string().uuid('Invalid jurisdiction ID'),
    reportedAt: z.string().datetime().default(() => new Date().toISOString()),
    missingSince: z.string().datetime(),
    priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
    incidentSummary: z.string().min(5, 'Incident summary must be at least 5 characters'),
  }),
});

export const updateCaseSchema = z.object({
  priority: z.nativeEnum(Priority).optional(),
  incidentSummary: z.string().min(5).optional(),
  missingSince: z.string().datetime().optional(),
}).strict(); // strictly rejects any extra fields like caseState, tracingOutcome, etc.

export const updateOutcomeSchema = z.object({
  tracingOutcome: z.nativeEnum(TracingOutcome),
  notes: z.string().min(5, 'Verification notes must be at least 5 characters'),
});

export const transitionStateSchema = z.object({
  targetState: z.nativeEnum(CaseState),
  reason: z.string().min(5, 'A clear reason of at least 5 characters is required'),
});

export const reopenCaseSchema = z.object({
  reason: z.string().min(5, 'Reopening reason must be at least 5 characters'),
});

export const assignCaseSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  assignmentRole: z.nativeEnum(AssignmentRole).default(AssignmentRole.PRIMARY_OFFICER),
  reassignmentReason: z.string().optional(),
});

export const searchRadiusSchema = z.object({
  anchorObservationId: z.string().uuid('Invalid observation ID'),
  assumedTravelMode: z.enum(['PEDESTRIAN', 'VEHICULAR', 'TRANSIT']).default('PEDESTRIAN'),
  maxSpeedKmh: z.number().positive().max(200).optional(),
  analysisTime: z.string().datetime().optional(),
  excludedObservationIds: z.array(z.string().uuid()).default([]),
  exclusionReasons: z.record(z.string()).default({}),
});

export const caseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  caseState: z.nativeEnum(CaseState).optional(),
  tracingOutcome: z.nativeEnum(TracingOutcome).optional(),
  priority: z.nativeEnum(Priority).optional(),
  jurisdictionId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  sortBy: z.enum(['reportedAt', 'missingSince', 'priority', 'lastActivityAt', 'caseReference']).default('reportedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidParamSchema = z.string().uuid('Invalid identifier format: must be a valid UUID');

export type CreateCaseDTO = z.infer<typeof createCaseSchema>;
export type UpdateCaseDTO = z.infer<typeof updateCaseSchema>;
export type UpdateOutcomeDTO = z.infer<typeof updateOutcomeSchema>;
export type TransitionStateDTO = z.infer<typeof transitionStateSchema>;
export type ReopenCaseDTO = z.infer<typeof reopenCaseSchema>;
export type AssignCaseDTO = z.infer<typeof assignCaseSchema>;
export type SearchRadiusDTO = z.infer<typeof searchRadiusSchema>;
export type CaseQueryDTO = z.infer<typeof caseQuerySchema>;
