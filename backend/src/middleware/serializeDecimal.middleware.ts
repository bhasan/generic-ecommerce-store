import { Request, Response, NextFunction } from 'express';
import { Prisma } from '../../generated/prisma';

/**
 * Recursively converts Prisma `Decimal` values to plain JS numbers so API responses
 * stay numeric (Decimal serializes to a JSON string by default, which would break
 * frontend money math). Mutates objects in place; leaves Dates and primitives alone.
 */
function convertDecimals(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = convertDecimals(value[i]);
    return value;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = convertDecimals(record[key]);
    }
    return record;
  }
  return value;
}

/**
 * Central API mapper: wraps res.json so every response body has its Decimal money
 * fields emitted as numbers. Register once, before the routes.
 */
export function serializeDecimal(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => originalJson(convertDecimals(body));
  next();
}

