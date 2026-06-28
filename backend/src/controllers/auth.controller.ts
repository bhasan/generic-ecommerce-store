import { Request, Response } from 'express';
import authService from '../services/auth.service';
import { validateRequest } from '../utils/request.util';
import { logger } from '../utils/logger';
import { successResponse } from '../utils/responseEnvelope';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  clearRefreshCookieOptions,
} from '../utils/authCookie.util';

export class AuthController {
  async register(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const result = await authService.register(req.body);
    res.status(201).json(successResponse(result));
  }

  async login(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const { refreshToken, ...result } = await authService.login(req.body);
    logger.logEvent('auth.login_success', {
      requestId: req.requestId,
      userId: result.user?.id,
      roles: result.user?.roles,
    });
    // Refresh token goes into an httpOnly cookie — never the JSON body, so it
    // stays out of JavaScript's reach. The access token stays in the body.
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.status(200).json(successResponse(result, 'Login successful'));
  }

  async getProfile(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const user = await authService.getProfile(req.user.userId);
    res.status(200).json(successResponse(user));
  }

  async refresh(req: Request, res: Response): Promise<void> {
    // Refresh token arrives in the httpOnly cookie set at login.
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    const { token, refreshToken } = await authService.refresh(rawToken);
    // Rotation: replace the cookie with the freshly minted refresh token.
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.status(200).json(successResponse({ token }));
  }

  async logout(req: Request, res: Response): Promise<void> {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    await authService.logout(rawToken);
    res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
    res.status(200).json(successResponse(null, 'Logout successful'));
  }
}

export default new AuthController();
