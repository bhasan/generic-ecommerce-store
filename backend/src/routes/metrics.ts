import { Router, Request, Response } from 'express';
import * as ipaddr from 'ipaddr.js';
import { register } from '../middleware/metrics.middleware';

const router = Router();

// Check the raw socket address — never req.ip, which respects trust proxy and
// can be spoofed via X-Forwarded-For if the allowlist is the only guard.
function isInternalRequest(req: Request): boolean {
  const raw = req.socket.remoteAddress || '';
  try {
    const parsed = ipaddr.process(raw); // normalises IPv4-mapped IPv6 (::ffff:x.x.x.x)
    const range = parsed.range();
    return range === 'loopback' || range === 'private' || range === 'uniqueLocal';
  } catch {
    return false;
  }
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
