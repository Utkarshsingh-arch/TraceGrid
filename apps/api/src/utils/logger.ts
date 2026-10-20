/**
 * TraceGrid Structured Operational Logger
 * Standardized logging with timestamps, levels, components, correlation IDs,
 * and strict redaction of sensitive credentials, tokens, and secrets.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'jwt',
  'secret',
  'authorization',
  'cookie',
  'refreshtoken',
  'bearer',
]);

export function sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
  if (!context || typeof context !== 'object') return undefined;

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      sanitized[key] = sanitizeContext(val);
    } else if (typeof val === 'string' && val.length > 200 && key.toLowerCase().includes('token')) {
      sanitized[key] = '[REDACTED_TOKEN]';
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export class Logger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, requestId?: string): void {
    const timestamp = new Date().toISOString();
    const safeContext = sanitizeContext(context);
    const reqTag = requestId ? ` [${requestId}]` : '';

    const logEntry = {
      timestamp,
      level,
      component: this.component,
      requestId: requestId || null,
      message,
      ...(safeContext ? { context: safeContext } : {}),
    };

    if (level === 'ERROR') {
      console.error(`[${timestamp}] [ERROR] [${this.component}]${reqTag} ${message}`, safeContext ? JSON.stringify(safeContext) : '');
    } else if (level === 'WARN') {
      console.warn(`[${timestamp}] [WARN] [${this.component}]${reqTag} ${message}`, safeContext ? JSON.stringify(safeContext) : '');
    } else {
      console.log(`[${timestamp}] [${level}] [${this.component}]${reqTag} ${message}`, safeContext ? JSON.stringify(safeContext) : '');
    }
  }

  public debug(message: string, context?: Record<string, any>, requestId?: string): void {
    if (process.env.NODE_ENV !== 'production') {
      this.log('DEBUG', message, context, requestId);
    }
  }

  public info(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log('INFO', message, context, requestId);
  }

  public warn(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log('WARN', message, context, requestId);
  }

  public error(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log('ERROR', message, context, requestId);
  }
}

export function createLogger(component: string): Logger {
  return new Logger(component);
}
