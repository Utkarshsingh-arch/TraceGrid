import { z } from 'zod';
import { LeadStatus, LeadSource } from '@prisma/client';

export const createLeadSchema = z.object({
  sourceType: z.nativeEnum(LeadSource),
  sourceContact: z.string().max(255).optional(),
  narrative: z.string().min(5, 'Narrative must be at least 5 characters'),
  observedAt: z.string().datetime().optional(),
  reportedAt: z.string().datetime().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationUncertaintyMeters: z.number().positive().max(100000).optional(),
  locationDescription: z.string().max(255).optional(),
  assignedUserId: z.string().uuid('Invalid assigned investigator ID').optional(),
});

export const updateLeadMetadataSchema = z.object({
  narrative: z.string().min(5).optional(),
  sourceContact: z.string().max(255).optional(),
  locationDescription: z.string().max(255).optional(),
  findings: z.string().optional(),
}).strict();

export const assignLeadSchema = z.object({
  assignedUserId: z.string().uuid('Invalid assigned investigator ID'),
  reassignmentReason: z.string().max(500).optional(),
});

export const recordLeadOutcomeSchema = z.object({
  verificationStatus: z.nativeEnum(LeadStatus),
  findings: z.string().min(5, 'Verification findings must be at least 5 characters'),
  duplicateOfLeadId: z.string().uuid('Invalid duplicate reference ID').optional(),
});

export const leadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  verificationStatus: z.nativeEnum(LeadStatus).optional(),
  assignedUserId: z.string().uuid().optional(),
  sourceType: z.nativeEnum(LeadSource).optional(),
  search: z.string().optional(),
});

export type CreateLeadDTO = z.infer<typeof createLeadSchema>;
export type UpdateLeadMetadataDTO = z.infer<typeof updateLeadMetadataSchema>;
export type AssignLeadDTO = z.infer<typeof assignLeadSchema>;
export type RecordLeadOutcomeDTO = z.infer<typeof recordLeadOutcomeSchema>;
export type LeadQueryDTO = z.infer<typeof leadQuerySchema>;
