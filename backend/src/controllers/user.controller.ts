import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import userService from '../services/user.service';

export class UserController {
  /**
   * Get all users
   * GET /api/users
   */
  async getAllUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await userService.getAllUsers();
      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const requestingUserId = req.user?.userId;
      const requestingUserRoles = req.user?.roles;

      const user = await userService.getUserById(userId, requestingUserId, requestingUserRoles);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user
   * PUT /api/users/:id
   */
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const userId = parseInt(req.params.id, 10);
      
      if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const requestingUserId = req.user?.userId;
      const requestingUserRoles = req.user?.roles;

      const updatedUser = await userService.updateUser(
        userId,
        req.body,
        requestingUserId,
        requestingUserRoles
      );
      
      res.status(200).json({
        message: 'User updated successfully',
        user: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user
   * DELETE /api/users/:id
   */
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const result = await userService.deleteUser(userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();

