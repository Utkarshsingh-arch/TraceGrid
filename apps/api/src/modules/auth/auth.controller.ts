import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { loginSchema } from './auth.dto';

import { prisma } from '../../database/prisma';

export class AuthController {
  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = loginSchema.parse(req.body);
      const result = await AuthService.login(validated.email, validated.password);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.token) {
        AuthService.logout(req.token);
      }
      if (req.user) {
        const clientIp = typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0].trim()
          : (req.ip || req.socket.remoteAddress || null);

        await prisma.auditLog.create({
          data: {
            actorUserId: req.user.id,
            action: 'USER_LOGOUT',
            entityType: 'users',
            entityId: req.user.id,
            reason: 'User session explicitly terminated via logout',
            ipAddress: clientIp ? String(clientIp).slice(0, 45) : null,
            userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
          },
        });
      }
      res.status(200).json({
        success: true,
        data: { message: 'Session logged out successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getMe(req.user!.id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }
}
