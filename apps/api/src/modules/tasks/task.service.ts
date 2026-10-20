import { prisma } from '../../database/prisma';
import { 
  CreateTaskDTO, 
  UpdateTaskDTO, 
  AssignTaskDTO, 
  CompleteTaskDTO, 
  CancelTaskDTO, 
  TaskQueryDTO 
} from './task.dto';
import { AuthUser } from '../../types/express';
import { 
  NotFoundError, 
  ForbiddenError, 
  ConflictError, 
  ValidationError 
} from '../../utils/errors';
import { 
  Role, 
  TaskStatus, 
  EventType, 
  CaseState 
} from '@prisma/client';

export function enrichTaskWithOverdue<T extends { dueDate: Date; status: TaskStatus }>(task: T) {
  const isOverdue =
    new Date() > new Date(task.dueDate) &&
    (task.status === TaskStatus.PENDING || task.status === TaskStatus.IN_PROGRESS);

  return {
    ...task,
    isOverdue,
  };
}

export class TaskService {
  /**
   * Create an investigation task for a case with optional cross-case validated lead linkage.
   */
  public static async createTask(caseId: string, dto: CreateTaskDTO, actorUser: AuthUser) {
    if (actorUser.role === Role.READ_ONLY_REVIEWER || actorUser.role === Role.DATA_CLERK) {
      throw new ForbiddenError('Unauthorized: only case officers, supervisors or administrators can task investigations');
    }

    const investigationCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!investigationCase) {
      throw new NotFoundError(`Case with ID ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== investigationCase.jurisdictionId) {
        throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
      }
    }

    if (investigationCase.caseState === CaseState.CLOSED) {
      throw new ConflictError('Cannot create new tasks on a closed investigation case. Reopen the case first.');
    }

    // Cross-case Lead Validation
    if (dto.leadId) {
      const lead = await prisma.leadSighting.findUnique({
        where: { id: dto.leadId },
      });
      if (!lead) {
        throw new ValidationError('Referenced lead sighting does not exist');
      }
      if (lead.caseId !== caseId) {
        throw new ValidationError('Validation failed: referenced lead sighting belongs to a different investigation case');
      }
    }

    // Assigned User Validation
    if (dto.assignedUserId) {
      const assignee = await prisma.user.findUnique({
        where: { id: dto.assignedUserId },
      });
      if (!assignee || !assignee.isActive) {
        throw new ValidationError('Target assigned investigator does not exist or is inactive');
      }
      if (
        assignee.jurisdictionId &&
        assignee.jurisdictionId !== investigationCase.jurisdictionId &&
        assignee.role !== Role.SYSTEM_ADMIN
      ) {
        throw new ValidationError('Assigned investigator must belong to the case jurisdiction or global scope');
      }
    }

    return await prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const count = await tx.investigationTask.count();
      let refNum = count + 1;
      let taskReference = `TSK-${currentYear}-${String(refNum).padStart(4, '0')}`;

      while (await tx.investigationTask.findUnique({ where: { taskReference } })) {
        refNum++;
        taskReference = `TSK-${currentYear}-${String(refNum).padStart(4, '0')}`;
      }

      const newTask = await tx.investigationTask.create({
        data: {
          taskReference,
          caseId,
          leadId: dto.leadId || null,
          assignedUserId: dto.assignedUserId || null,
          title: dto.title,
          description: dto.description,
          dueDate: new Date(dto.dueDate),
          priority: dto.priority,
          status: TaskStatus.PENDING,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
          lead: {
            select: {
              id: true,
              leadReference: true,
              sourceType: true,
            },
          },
        },
      });

      await tx.investigationCase.update({
        where: { id: caseId },
        data: { lastActivityAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: EventType.NOTE_ADDED,
          actorUserId: actorUser.id,
          description: `Task lodged: ${taskReference} — "${dto.title}" (Due: ${new Date(dto.dueDate).toLocaleDateString()}). Priority: ${dto.priority}.`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'TASK_CREATED',
          entityType: 'investigation_tasks',
          entityId: newTask.id,
          caseId,
          newStateJson: {
            taskReference,
            title: dto.title,
            priority: dto.priority,
            dueDate: dto.dueDate,
            assignedUserId: dto.assignedUserId || null,
            leadId: dto.leadId || null,
          },
          reason: 'Initial task assignment',
        },
      });

      return enrichTaskWithOverdue(newTask);
    });
  }

  /**
   * Retrieve tasks for a case with filtering and dynamic overdue evaluation.
   */
  public static async getTasksForCase(caseId: string, query: TaskQueryDTO, actorUser: AuthUser) {
    const investigationCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!investigationCase) {
      throw new NotFoundError(`Case with ID ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== investigationCase.jurisdictionId) {
        throw new ForbiddenError('Access denied: case jurisdiction outside scope');
      }
    }

    const now = new Date();
    const where: any = {
      caseId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };

    if (query.isOverdue === true) {
      where.status = { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] };
      where.dueDate = { lt: now };
    } else if (query.isOverdue === false) {
      where.OR = [
        { status: { in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] } },
        { dueDate: { gte: now } },
      ];
    }

    if (query.search) {
      where.OR = [
        { taskReference: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [tasks, total] = await Promise.all([
      prisma.investigationTask.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { dueDate: 'asc' },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
          lead: {
            select: {
              id: true,
              leadReference: true,
              sourceType: true,
            },
          },
        },
      }),
      prisma.investigationTask.count({ where }),
    ]);

    return {
      tasks: tasks.map(enrichTaskWithOverdue),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Retrieve a single task by ID with full context and dynamic overdue flag.
   */
  public static async getTaskById(id: string, actorUser: AuthUser) {
    const task = await prisma.investigationTask.findUnique({
      where: { id },
      include: {
        case: {
          select: {
            id: true,
            caseReference: true,
            jurisdictionId: true,
            caseState: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            displayName: true,
            badgeNumber: true,
            role: true,
            email: true,
          },
        },
        lead: {
          select: {
            id: true,
            leadReference: true,
            sourceType: true,
            narrative: true,
            verificationStatus: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundError(`Task with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== task.case.jurisdictionId) {
        throw new ForbiddenError('Access denied: task belongs to a jurisdiction outside your scope');
      }
    }

    return enrichTaskWithOverdue(task);
  }

  /**
   * Update permitted task metadata.
   */
  public static async updateTask(id: string, dto: UpdateTaskDTO, actorUser: AuthUser) {
    if (actorUser.role === Role.READ_ONLY_REVIEWER || actorUser.role === Role.DATA_CLERK) {
      throw new ForbiddenError('Reviewers and clerks cannot modify investigation tasks');
    }

    const task = await prisma.investigationTask.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!task) {
      throw new NotFoundError(`Task with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== task.case.jurisdictionId) {
        throw new ForbiddenError('Access denied');
      }
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      throw new ConflictError(`Cannot edit a task that is already ${task.status}.`);
    }

    // Cross-case lead validation if leadId updated
    if (dto.leadId) {
      const lead = await prisma.leadSighting.findUnique({
        where: { id: dto.leadId },
      });
      if (!lead || lead.caseId !== task.caseId) {
        throw new ValidationError('Validation failed: referenced lead does not belong to the same investigation case');
      }
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationTask.update({
        where: { id },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.leadId !== undefined ? { leadId: dto.leadId } : {}),
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
          lead: {
            select: {
              id: true,
              leadReference: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'TASK_UPDATED',
          entityType: 'investigation_tasks',
          entityId: id,
          caseId: task.caseId,
          newStateJson: dto,
          reason: 'Investigative task details updated',
        },
      });

      return enrichTaskWithOverdue(updated);
    });
  }

  /**
   * Assign or reassign a task to an investigator.
   */
  public static async assignTask(id: string, dto: AssignTaskDTO, actorUser: AuthUser) {
    if (
      actorUser.role !== Role.CASE_OFFICER &&
      actorUser.role !== Role.SUPERVISOR &&
      actorUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ForbiddenError('Unauthorized to assign investigation tasks');
    }

    const task = await prisma.investigationTask.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!task) {
      throw new NotFoundError(`Task with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== task.case.jurisdictionId) {
        throw new ForbiddenError('Access denied');
      }
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      throw new ConflictError(`Cannot reassign a task that is already ${task.status}.`);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: dto.assignedUserId },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new ValidationError('Target investigator is invalid or inactive');
    }

    if (
      targetUser.jurisdictionId &&
      targetUser.jurisdictionId !== task.case.jurisdictionId &&
      targetUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ValidationError('Investigator must belong to the same jurisdiction or global system scope');
    }

    const prevUserId = task.assignedUserId;
    const nextStatus = task.status === TaskStatus.PENDING ? TaskStatus.IN_PROGRESS : task.status;

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationTask.update({
        where: { id },
        data: {
          assignedUserId: dto.assignedUserId,
          status: nextStatus,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: task.caseId,
          eventType: EventType.ASSIGNMENT_CHANGED,
          actorUserId: actorUser.id,
          description: `Task ${task.taskReference} assigned to ${targetUser.displayName} (${targetUser.badgeNumber || 'No Badge'}). Reason: ${dto.reassignmentReason || 'Operational dispatch'}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'TASK_ASSIGNED',
          entityType: 'investigation_tasks',
          entityId: id,
          caseId: task.caseId,
          previousStateJson: { assignedUserId: prevUserId },
          newStateJson: { assignedUserId: dto.assignedUserId, status: nextStatus },
          reason: dto.reassignmentReason || 'Task assigned to officer',
        },
      });

      return enrichTaskWithOverdue(updated);
    });
  }

  /**
   * Mark an investigation task as completed with required outcome notes.
   */
  public static async completeTask(id: string, dto: CompleteTaskDTO, actorUser: AuthUser) {
    if (
      actorUser.role !== Role.CASE_OFFICER &&
      actorUser.role !== Role.SUPERVISOR &&
      actorUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ForbiddenError('Unauthorized to complete investigation tasks');
    }

    const task = await prisma.investigationTask.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!task) {
      throw new NotFoundError(`Task with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== task.case.jurisdictionId) {
        throw new ForbiddenError('Access denied');
      }
    }

    if (task.status === TaskStatus.COMPLETED) {
      throw new ConflictError('Task is already marked as completed');
    }

    if (task.status === TaskStatus.CANCELLED) {
      throw new ConflictError('Cannot complete a cancelled task');
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationTask.update({
        where: { id },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
          outcomeNotes: dto.outcomeNotes,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      await tx.investigationCase.update({
        where: { id: task.caseId },
        data: { lastActivityAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId: task.caseId,
          eventType: EventType.TASK_COMPLETED,
          actorUserId: actorUser.id,
          description: `Task ${task.taskReference} completed: "${task.title}". Findings: ${dto.outcomeNotes}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'TASK_COMPLETED',
          entityType: 'investigation_tasks',
          entityId: id,
          caseId: task.caseId,
          previousStateJson: { status: task.status },
          newStateJson: { status: TaskStatus.COMPLETED, outcomeNotes: dto.outcomeNotes },
          reason: dto.outcomeNotes,
        },
      });

      return enrichTaskWithOverdue(updated);
    });
  }

  /**
   * Cancel an investigation task with an authorized reason.
   */
  public static async cancelTask(id: string, dto: CancelTaskDTO, actorUser: AuthUser) {
    if (
      actorUser.role !== Role.CASE_OFFICER &&
      actorUser.role !== Role.SUPERVISOR &&
      actorUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ForbiddenError('Unauthorized to cancel investigation tasks');
    }

    const task = await prisma.investigationTask.findUnique({
      where: { id },
      include: { case: true },
    });

    if (!task) {
      throw new NotFoundError(`Task with ID ${id} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId || actorUser.jurisdictionId !== task.case.jurisdictionId) {
        throw new ForbiddenError('Access denied');
      }
    }

    if (task.status === TaskStatus.COMPLETED) {
      throw new ConflictError('Completed tasks cannot be cancelled');
    }

    if (task.status === TaskStatus.CANCELLED) {
      throw new ValidationError('Task is already cancelled');
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.investigationTask.update({
        where: { id },
        data: {
          status: TaskStatus.CANCELLED,
          outcomeNotes: `Cancelled: ${dto.reason}`,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: task.caseId,
          eventType: EventType.NOTE_ADDED,
          actorUserId: actorUser.id,
          description: `Task ${task.taskReference} CANCELLED. Reason: ${dto.reason}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'TASK_CANCELLED',
          entityType: 'investigation_tasks',
          entityId: id,
          caseId: task.caseId,
          previousStateJson: { status: task.status },
          newStateJson: { status: TaskStatus.CANCELLED, reason: dto.reason },
          reason: dto.reason,
        },
      });

      return enrichTaskWithOverdue(updated);
    });
  }
}
