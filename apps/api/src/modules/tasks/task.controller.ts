import { Request, Response, NextFunction } from 'express';
import { TaskService } from './task.service';
import { 
  createTaskSchema, 
  updateTaskSchema, 
  assignTaskSchema, 
  completeTaskSchema, 
  cancelTaskSchema, 
  taskQuerySchema 
} from './task.dto';

export class TaskController {
  public static async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createTaskSchema.parse(req.body);
      const caseId = req.params.caseId;
      const task = await TaskService.createTask(caseId, validated, req.user!);

      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getTasksForCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = taskQuerySchema.parse(req.query);
      const caseId = req.params.caseId;
      const { tasks, meta } = await TaskService.getTasksForCase(caseId, query, req.user!);

      res.status(200).json({
        success: true,
        data: tasks,
        meta,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const task = await TaskService.getTaskById(req.params.id, req.user!);

      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = updateTaskSchema.parse(req.body);
      const updated = await TaskService.updateTask(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async assignTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = assignTaskSchema.parse(req.body);
      const updated = await TaskService.assignTask(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async completeTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = completeTaskSchema.parse(req.body);
      const updated = await TaskService.completeTask(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async cancelTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = cancelTaskSchema.parse(req.body);
      const updated = await TaskService.cancelTask(req.params.id, validated, req.user!);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}
