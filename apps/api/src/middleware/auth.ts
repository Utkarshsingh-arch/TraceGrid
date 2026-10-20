import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { tokenRevocationStore } from '../modules/auth/tokenRevocation';
import { JwtPayload } from '../modules/auth/auth.service';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authorization bearer token is required');
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new UnauthorizedError('Authorization bearer token is missing');
  }

  // Check if token has been explicitly revoked via logout
  if (tokenRevocationStore.isRevoked(token)) {
    throw new UnauthorizedError('Authentication token has been revoked');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      displayName: '', // populated on demand if needed
      role: decoded.role,
      jurisdictionId: decoded.jurisdictionId,
    };
    req.token = token;
    next();
  } catch (err: any) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Authentication token has expired');
    }
    throw new UnauthorizedError('Invalid or forged authentication token');
  }
}

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Role '${req.user.role}' is not authorized to perform this operation. Required: [${allowedRoles.join(', ')}]`
      );
    }

    next();
  };
}

export function enforceJurisdictionScope(userJurisdictionId: string | null, targetJurisdictionId: string, role: Role): void {
  // SYSTEM_ADMIN has platform-wide global override
  if (role === Role.SYSTEM_ADMIN) {
    return;
  }

  if (!userJurisdictionId || userJurisdictionId !== targetJurisdictionId) {
    throw new ForbiddenError('Access denied: operation targets a resource outside your assigned jurisdiction scope');
  }
}
