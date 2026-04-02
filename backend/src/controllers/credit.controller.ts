import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import creditService from '../services/credit.service';
import { hasAnyRole } from '../constants/roles';

export class CreditController {
  /**
   * GET /api/credits/:userId
   * Returns balance + recent transactions for a user.
   * Own user or management/admin.
   */
  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const requesterId = req.user!.userId;
      const requesterRoles = req.user!.roles;
      const isStaff = hasAnyRole(requesterRoles, ['MANAGEMENT', 'ADMIN']);

      if (!isStaff && requesterId !== targetUserId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const balance = await creditService.getUserCreditBalance(targetUserId);
      res.json({ userId: targetUserId, balance });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/credits/:userId/transactions
   * Returns credit transaction history.
   * Own user or management/admin.
   */
  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const requesterId = req.user!.userId;
      const requesterRoles = req.user!.roles;
      const isStaff = hasAnyRole(requesterRoles, ['MANAGEMENT', 'ADMIN']);

      if (!isStaff && requesterId !== targetUserId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const transactions = await creditService.getCreditTransactions(targetUserId);
      res.json(transactions);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/credits/:userId/add
   * Add credit to a user's account. Management/Admin only.
   */
  async addCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const { amount, note } = req.body;
      const createdBy = req.user!.userId;

      const transaction = await creditService.addCredit(targetUserId, amount, note, createdBy);
      const newBalance = await creditService.getUserCreditBalance(targetUserId);
      res.status(201).json({ transaction, newBalance });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/credits/:userId/remove
   * Remove credit from a user's account. Management/Admin only.
   */
  async removeCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const { amount, note } = req.body;
      const createdBy = req.user!.userId;

      const transaction = await creditService.removeCredit(targetUserId, amount, note, createdBy);
      const newBalance = await creditService.getUserCreditBalance(targetUserId);
      res.status(201).json({ transaction, newBalance });
    } catch (error) {
      next(error);
    }
  }
}

export default new CreditController();
