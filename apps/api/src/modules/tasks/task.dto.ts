import { z } from 'zod';
import { TaskStatus, Priority } from '@prisma/client';

export const createTaskSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(128),
  description: z.string().min(5, 'Task description must be at least 5 characters'),
  dueDate: z.string().datetime('Valid ISO datetime due date is required'),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  assignedUserId: z.string().uuid('Invalid assigned user ID').optional(),
  leadId: z.string().uuid('Invalid lead ID').optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(3).max(128).optional(),
  description: z.string().min(5).optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.nativeEnum(Priority).optional(),
  leadId: z.string().uuid().nullable().optional(),
}).strict();

export const assignTaskSchema = z.object({
  assignedUserId: z.string().uuid('Invalid assigned investigator ID'),
  reassignmentReason: z.string().max(500).optional(),
});

export const completeTaskSchema = z.object({
  outcomeNotes: z.string().min(5, 'Completion outcome notes must be at least 5 characters'),
});

export const cancelTaskSchema = z.object({
  reason: z.string().min(5, 'Authorized cancellation reason must be at least 5 characters'),
});

export const taskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.nativeEnum(TaskStatus).optional(),
  assignedUserId: z.string().uuid().optional(),
  priority: z.nativeEnum(Priority).optional(),
  isOverdue: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  search: z.string().optional(),
});

export type CreateTaskDTO = z.infer<typeof createTaskSchema>;
export type UpdateTaskDTO = z.infer<typeof updateTaskSchema>;
export type AssignTaskDTO = z.infer<typeof assignTaskSchema>;
export type CompleteTaskDTO = z.infer<typeof completeTaskSchema>;
export type CancelTaskDTO = z.infer<typeof cancelTaskSchema>;
export type TaskQueryDTO = z.infer<typeof taskQuerySchema>;
