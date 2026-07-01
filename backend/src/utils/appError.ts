/**
 * Custom error class
 *
 * Pure module: no express / request imports. Kept separate from
 * `error.middleware.ts` so scripts (prisma seeds, migrations) can pull in
 * `AppError` — via `tenantContext` / `database` — without dragging the express
 * global augmentation (`req.user`, `req.requestId`) into their import graph.
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? AppError.defaultCode(statusCode);
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  private static defaultCode(statusCode: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
    };
    return codes[statusCode] ?? 'INTERNAL_ERROR';
  }
}
