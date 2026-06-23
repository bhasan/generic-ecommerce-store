import { Request, Response } from 'express';
import { validationResult } from 'express-validator';

export function validateRequest(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

export function parseIntParam(value: string, res: Response, label: string): number | null {
  const id = parseInt(value, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: `Invalid ${label} ID` });
    return null;
  }
  return id;
}

export function parseOptionalIntQuery(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
