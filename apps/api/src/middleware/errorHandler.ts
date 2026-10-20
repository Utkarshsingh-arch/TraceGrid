import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const logger = createLogger('ErrorHandler');

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();
  const requestId = req.id || (typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined);

  // 1. Handle Zod Validation Errors
  if (err instanceof ZodError) {
    logger.warn('Validation error on incoming request', { path: req.path, method: req.method }, requestId);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: err.flatten().fieldErrors,
        timestamp,
        ...(requestId ? { requestId } : {}),
      },
    });
    return;
  }

  // 2. Handle Body Parser JSON Syntax Errors
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    logger.warn('Malformed JSON syntax in request body', { path: req.path, method: req.method }, requestId);
    res.status(400).json({
      success: false,
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request payload contains malformed JSON syntax',
        details: null,
        timestamp,
        ...(requestId ? { requestId } : {}),
      },
    });
    return;
  }

  // 3. Handle Known Application Operational Errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`Operational error [${err.code}]: ${err.message}`, { path: req.path, method: req.method, statusCode: err.statusCode }, requestId);
    } else {
      logger.warn(`Client rejected [${err.code}]: ${err.message}`, { path: req.path, method: req.method, statusCode: err.statusCode }, requestId);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
        timestamp,
        ...(requestId ? { requestId } : {}),
      },
    });
    return;
  }

  // 4. Handle Prisma Known Database Operational Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn(`Database constraint error [${err.code}]: ${err.message}`, { prismaCode: err.code, path: req.path }, requestId);

    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT_DUPLICATE_KEY',
          message: 'A resource with conflicting unique attributes already exists',
          details: null,
          timestamp,
          ...(requestId ? { requestId } : {}),
        },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested database record does not exist',
          details: null,
          timestamp,
          ...(requestId ? { requestId } : {}),
        },
      });
      return;
    }
  }

  // 5. Unhandled / Unexpected Errors (Suppresses internals, stack traces, and filesystem paths)
  logger.error(
    `Unhandled exception: ${err?.message || 'Unknown error'}`,
    {
      name: err?.name,
      stack: (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') ? undefined : err?.stack,
      path: req.path,
      method: req.method,
    },
    requestId
  );

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging')
        ? 'An unexpected internal error occurred'
        : (err?.message || 'Internal Server Error'),
      details: null,
      timestamp,
      ...(requestId ? { requestId } : {}),
    },
  });
}
