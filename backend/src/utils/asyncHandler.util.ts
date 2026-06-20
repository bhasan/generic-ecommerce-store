import { Request, Response, RequestHandler } from 'express';

type AsyncControllerFn = (req: Request, res: Response) => Promise<void>;

export function asyncHandler(fn: AsyncControllerFn): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}
