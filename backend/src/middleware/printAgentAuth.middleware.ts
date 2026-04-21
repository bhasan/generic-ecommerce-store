import { Request, Response, NextFunction } from 'express';

export const authenticatePrintAgent = (req: Request, res: Response, next: NextFunction): void => {
  const expectedKey = process.env.PRINT_AGENT_SHARED_KEY;

  if (!expectedKey) {
    res.status(503).json({
      error: {
        message: 'Print agent authentication is not configured',
        code: 'PRINT_AGENT_AUTH_NOT_CONFIGURED',
        requestId: req.requestId || 'unknown',
      },
    });
    return;
  }

  const providedKey = req.header('x-print-agent-key');
  if (providedKey !== expectedKey) {
    res.status(401).json({
      error: {
        message: 'Invalid print agent key',
        code: 'INVALID_PRINT_AGENT_KEY',
        requestId: req.requestId || 'unknown',
      },
    });
    return;
  }

  next();
};
