import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import userService from '../services/user.service';

export class UserController {
  /**
   * Get all users
   * GET /api/users
   */
  async getAllUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
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
   * Get pending registrations
   * GET /api/users/pending
   */
  async getPendingRegistrations(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pendingUsers = await userService.getPendingRegistrations();
      res.status(200).json(pendingUsers);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Approve user
   * POST /api/users/:id/approve
   */
  async approveUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const approvedUser = await userService.approveUser(userId);
      res.status(200).json({
        message: 'User approved successfully',
        user: approvedUser
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get rejected users
   * GET /api/users/rejected
   */
  async getRejectedUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rejectedUsers = await userService.getRejectedUsers();
      res.status(200).json(rejectedUsers);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reject user registration
   * POST /api/users/:id/reject
   */
  async rejectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const { rejectionNote } = req.body;
      const result = await userService.rejectUser(userId, rejectionNote);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Un-reject user (move back to pending)
   * POST /api/users/:id/unreject
   */
  async unRejectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const result = await userService.unRejectUser(userId);
      res.status(200).json(result);
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

  /**
   * Get all roles
   * GET /api/users/roles
   */
  async getAllRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await userService.getAllRoles();
      res.status(200).json(roles);
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();

