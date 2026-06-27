import { Request, Response, NextFunction } from 'express';

export function requireIntParam(paramName: string, label: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    const id = parseInt(value, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: `Invalid ${label} ID` });
      return;
    }
    next();
  };
}
