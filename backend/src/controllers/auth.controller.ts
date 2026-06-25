import { Request, Response } from 'express';
import authService from '../services/auth.service';
import { validateRequest } from '../utils/request.util';
import { logger } from '../utils/logger';

export class AuthController {
  async register(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }

  async login(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const result = await authService.login(req.body);
    logger.logEvent('auth.login_success', {
      requestId: req.requestId,
      userId: result.user?.id,
      roles: result.user?.roles,
    });
    res.status(200).json({ message: 'Login successful', ...result });
  }

  async getProfile(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const user = await authService.getProfile(req.user.userId);
    res.status(200).json(user);
  }

  async refresh(req: Request, res: Response): Promise<void> {
    // Phase A: refresh token arrives in the request body. (Phase B moves it
    // to an httpOnly cookie.)
    const { refreshToken } = req.body ?? {};
    const result = await authService.refresh(refreshToken);
    res.status(200).json(result);
  }

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body ?? {};
    await authService.logout(refreshToken);
    res.status(200).json({ message: 'Logout successful' });
  }
}

export default new AuthController();
