import type { Request } from 'express';
import { logger } from './logger';

export function logAuditEvent(
  req: Request,
  action: string,
  context?: Record<string, unknown>,
): void {
  logger.info(action, {
    requestId: (req as any).requestId || 'unknown',
    actorUserId: (req as any).user?.userId || 'anonymous',
    ...context,
  });
}
