import { Router } from 'express';
import { TaskController } from './task.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { Role } from '@prisma/client';

// Router for case-scoped tasks: /api/v1/cases/:caseId/tasks
export const caseTaskRoutes = Router({ mergeParams: true });
caseTaskRoutes.use(authenticate);

caseTaskRoutes.get('/', TaskController.getTasksForCase);
caseTaskRoutes.post(
  '/',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  TaskController.createTask
);

// Router for direct task operations: /api/v1/tasks
export const directTaskRoutes = Router();
directTaskRoutes.use(authenticate);

directTaskRoutes.get('/:id', TaskController.getTaskById);
directTaskRoutes.patch(
  '/:id',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  TaskController.updateTask
);
directTaskRoutes.post(
  '/:id/assignments',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  TaskController.assignTask
);
directTaskRoutes.post(
  '/:id/complete',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  TaskController.completeTask
);
directTaskRoutes.post(
  '/:id/cancel',
  requireRole(Role.CASE_OFFICER, Role.SUPERVISOR, Role.SYSTEM_ADMIN),
  TaskController.cancelTask
);
