import { Request, Response, NextFunction } from 'express';

interface AttemptRecord {
  count: number;
  resetAt: number;
}

class LoginRateLimiter {
  private attempts = new Map<string, AttemptRecord>();
  private readonly windowMs: number;
  private readonly maxAttempts: number;

  constructor(
    windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000),
    maxAttempts = Number(
      process.env.AUTH_RATE_LIMIT_MAX ||
        (process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'test' ? 100 : 10)
    )
  ) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || '127.0.0.1';
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const ip = this.getClientIp(req);
      const now = Date.now();
      const record = this.attempts.get(ip);

      if (record && now < record.resetAt) {
        if (record.count >= this.maxAttempts) {
          const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
          res.setHeader('Retry-After', String(retryAfterSec));
          res.status(429).json({
            success: false,
            error: {
              code: 'TOO_MANY_REQUESTS',
              message: `Too many login attempts from this IP address. Please try again after ${retryAfterSec} seconds.`,
              details: { retryAfterSeconds: retryAfterSec },
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }
        record.count++;
      } else {
        this.attempts.set(ip, {
          count: 1,
          resetAt: now + this.windowMs,
        });
      }

      next();
    };
  }

  public reset(): void {
    this.attempts.clear();
  }
}

export const defaultLoginLimiter = new LoginRateLimiter();
export const loginRateLimiter = defaultLoginLimiter.middleware();
export function resetLoginRateLimits(): void {
  defaultLoginLimiter.reset();
}
