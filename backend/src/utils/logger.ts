/**
 * Logger utility for consistent logging across the application
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level,
      message,
      ...(context || {}),
    };
    return JSON.stringify(payload);
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext: LogContext = {
      ...(context || {}),
      ...(error instanceof Error && {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
      }),
      ...(typeof error === 'object' && error !== null && { error }),
    };
    console.error(this.formatMessage('error', message, errorContext));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(this.formatMessage('debug', message, context));
    }
  }
}

export const logger = new Logger();

