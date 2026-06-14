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
  return parseInt(value, 10);
}
