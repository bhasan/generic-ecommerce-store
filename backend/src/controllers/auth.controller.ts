import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import authService from '../services/auth.service';

export class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const result = await authService.register(req.body);
      res.status(201).json({
        message: 'User registered successfully',
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const result = await authService.login(req.body);
      res.status(200).json({
        message: 'Login successful',
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await authService.getProfile(req.user.userId);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user (client-side removes token)
   * POST /api/auth/logout
   */
  async logout(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ message: 'Logout successful' });
  }
}

export default new AuthController();
