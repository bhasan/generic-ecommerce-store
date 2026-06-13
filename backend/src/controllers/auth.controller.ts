import { Request, Response } from 'express';
import authService from '../services/auth.service';
import { validateRequest } from '../utils/request.util';

export class AuthController {
  async register(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }

  async login(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const result = await authService.login(req.body);
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

  async logout(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ message: 'Logout successful' });
  }
}

export default new AuthController();
