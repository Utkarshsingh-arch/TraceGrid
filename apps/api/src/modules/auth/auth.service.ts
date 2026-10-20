import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../../database/prisma';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../utils/errors';
import { tokenRevocationStore } from './tokenRevocation';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  jurisdictionId: string | null;
  jti?: string;
  iat?: number;
  exp?: number;
}

export class AuthService {
  public static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { jurisdiction: true },
    });

    if (!user || !user.isActive) {
      // Generic error message to prevent account enumeration
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login timestamp asynchronously
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jurisdictionId: user.jurisdictionId,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
      jwtid: crypto.randomUUID(),
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        badgeNumber: user.badgeNumber,
        role: user.role,
        jurisdictionId: user.jurisdictionId,
        jurisdiction: user.jurisdiction ? {
          id: user.jurisdiction.id,
          code: user.jurisdiction.code,
          name: user.jurisdiction.name,
          region: user.jurisdiction.region,
        } : null,
      },
    };
  }

  public static logout(token: string): void {
    try {
      const decoded = jwt.decode(token) as JwtPayload | null;
      if (decoded && decoded.exp) {
        tokenRevocationStore.revoke(token, decoded.exp);
      } else {
        // Fallback: revoke for 24 hours if no exp found
        tokenRevocationStore.revoke(token, Math.floor(Date.now() / 1000) + 86400);
      }
    } catch {
      // Ignored if invalid token format
    }
  }

  public static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { jurisdiction: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account not found or deactivated');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      badgeNumber: user.badgeNumber,
      role: user.role,
      jurisdictionId: user.jurisdictionId,
      jurisdiction: user.jurisdiction ? {
        id: user.jurisdiction.id,
        code: user.jurisdiction.code,
        name: user.jurisdiction.name,
        region: user.jurisdiction.region,
      } : null,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
