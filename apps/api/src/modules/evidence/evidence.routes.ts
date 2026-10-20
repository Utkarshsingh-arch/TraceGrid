import { Router } from 'express';
import { EvidenceController, attachmentUploadMiddleware } from './evidence.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { Role } from '@prisma/client';

// Router for case-scoped evidence: /api/v1/cases/:caseId/evidence
export const caseEvidenceRoutes = Router({ mergeParams: true });
caseEvidenceRoutes.use(authenticate);

caseEvidenceRoutes.get('/', EvidenceController.getEvidenceForCase);
caseEvidenceRoutes.post(
  '/',
  requireRole(Role.DATA_CLERK, Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  EvidenceController.createEvidence
);

// Router for direct evidence items: /api/v1/evidence
export const directEvidenceRoutes = Router();
directEvidenceRoutes.use(authenticate);

directEvidenceRoutes.get('/:id', EvidenceController.getEvidenceById);
directEvidenceRoutes.patch(
  '/:id',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  EvidenceController.updateEvidence
);
directEvidenceRoutes.post(
  '/:id/attachments',
  requireRole(Role.DATA_CLERK, Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  attachmentUploadMiddleware,
  EvidenceController.uploadAttachment
);

// Router for private attachments: /api/v1/attachments
export const attachmentRoutes = Router();
attachmentRoutes.use(authenticate);

attachmentRoutes.get('/:id', EvidenceController.getAttachmentMetadata);
attachmentRoutes.get('/:id/download', EvidenceController.streamAttachment);
