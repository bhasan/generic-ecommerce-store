import { Router, Request, Response } from 'express';
import { register } from '../middleware/metrics.middleware';

const router = Router();

// Restrict to Docker internal network and loopback — not proxied by Nginx externally
const ALLOWED_CIDRS = ['127.', '::1', '172.', '10.', '192.168.'];

function isInternalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ALLOWED_CIDRS.some(prefix => ip.startsWith(prefix));
}

router.get('/', async (req: Request, res: Response) => {
  if (!isInternalRequest(req)) {
    res.status(403).end();
    return;
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export default router;
