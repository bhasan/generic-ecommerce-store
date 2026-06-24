import { Request, Response } from 'express';
import userService from '../services/user.service';
import { logger } from '../utils/logger';
import { validateRequest, parseIntParam, parsePaginationQuery } from '../utils/request.util';

export class UserController {
  async getAllUsers(req: Request, res: Response) : Promise<void> {
    const { limit, offset } = parsePaginationQuery(
      req.query as { limit?: string; offset?: string },
      { defaultLimit: 100, maxLimit: 500 },
    );
    const users = await userService.getAllUsers(limit, offset);
    res.status(200).json(users);
  }

  async getUserById(req: Request, res: Response) : Promise<void> {
    const userId = parseIntParam(req.params.id, res, 'user');
    if (userId === null) return;
    const requestingUserId = req.user?.userId;
    const requestingUserRoles = req.user?.roles;
    const user = await userService.getUserById(userId, requestingUserId, requestingUserRoles);
    res.status(200).json(user);
  }

  async updateUser(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const userId = parseIntParam(req.params.id, res, 'user');
    if (userId === null) return;
    const requestingUserId = req.user?.userId;
    const requestingUserRoles = req.user?.roles;
    const updatedUser = await userService.updateUser(userId, req.body, requestingUserId, requestingUserRoles);
    logger.info('User update completed', {
      requestId: req.requestId || 'unknown',
      actorUserId: requestingUserId || 'anonymous',
      targetUserId: userId,
    });
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  }

  async getPendingRegistrations(_req: Request, res: Response) : Promise<void> {
    const pendingUsers = await userService.getPendingRegistrations();
    res.status(200).json(pendingUsers);
  }

  async approveUser(req: Request, res: Response) : Promise<void> {
    const userId = parseIntParam(req.params.id, res, 'user');
    if (userId === null) return;
    logger.info('User approval requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetUserId: userId,
    });
    const approvedUser = await userService.approveUser(userId);
    res.status(200).json({ message: 'User approved successfully', user: approvedUser });
  }

  async getRejectedUsers(_req: Request, res: Response) : Promise<void> {
    const rejectedUsers = await userService.getRejectedUsers();
    res.status(200).json(rejectedUsers);
  }

  async rejectUser(req: Request, res: Response) : Promise<void> {
    const userId = parseIntParam(req.params.id, res, 'user');
    if (userId === null) return;
    const { rejectionNote } = req.body;
    logger.info('User rejection requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetUserId: userId,
      hasRejectionNote: Boolean(rejectionNote),
    });
    const result = await userService.rejectUser(userId, rejectionNote);
    res.status(200).json(result);
  }

  async unRejectUser(req: Request, res: Response) : Promise<void> {
    const userId = parseIntParam(req.params.id, res, 'user');
    if (userId === null) return;
    logger.info('User un-reject requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetUserId: userId,
    });
    const result = await userService.unRejectUser(userId);
    res.status(200).json(result);
  }

  async deleteUser(req: Request, res: Response) : Promise<void> {
    const userId = parseIntParam(req.params.id, res, 'user');
    if (userId === null) return;
    logger.info('User delete requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetUserId: userId,
    });
    const result = await userService.deleteUser(userId);
    res.status(200).json(result);
  }

  async getAllRoles(_req: Request, res: Response) : Promise<void> {
    const roles = await userService.getAllRoles();
    res.status(200).json(roles);
  }
}

export default new UserController();
