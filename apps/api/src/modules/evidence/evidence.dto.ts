import { z } from 'zod';
import { EvidenceType, AccessClassification } from '@prisma/client';

export const createEvidenceSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(128),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  evidenceType: z.nativeEnum(EvidenceType),
  sourceProvenance: z.string().min(3, 'Chain of custody provenance must be recorded'),
  eventTimestamp: z.string().datetime().optional(),
  accessClassification: z.nativeEnum(AccessClassification).default(AccessClassification.INTERNAL),
  leadId: z.string().uuid('Invalid lead reference ID').optional(),
});

export const updateEvidenceSchema = z.object({
  title: z.string().min(3).max(128).optional(),
  description: z.string().min(5).optional(),
  sourceProvenance: z.string().min(3).optional(),
  accessClassification: z.nativeEnum(AccessClassification).optional(),
  isVerified: z.boolean().optional(),
}).strict();

export const evidenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  evidenceType: z.nativeEnum(EvidenceType).optional(),
  accessClassification: z.nativeEnum(AccessClassification).optional(),
  leadId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type CreateEvidenceDTO = z.infer<typeof createEvidenceSchema>;
export type UpdateEvidenceDTO = z.infer<typeof updateEvidenceSchema>;
export type EvidenceQueryDTO = z.infer<typeof evidenceQuerySchema>;
