import { Request, Response } from 'express';
import creditService from '../services/credit.service';
import { hasAnyRole } from '../constants/roles';
import { validateRequest, parseIntParam } from '../utils/request.util';

export class CreditController {
  async getBalance(req: Request, res: Response) : Promise<void> {
    const targetUserId = parseIntParam(req.params.userId, res, 'user');
    if (targetUserId === null) return;
    const requesterId = req.user!.userId;
    const requesterRoles = req.user!.roles;
    const isStaff = hasAnyRole(requesterRoles, ['MANAGEMENT', 'ADMIN']);
    if (!isStaff && requesterId !== targetUserId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const balance = await creditService.getUserCreditBalance(targetUserId);
    res.json({ userId: targetUserId, balance });
  }

  async getTransactions(req: Request, res: Response) : Promise<void> {
    const targetUserId = parseIntParam(req.params.userId, res, 'user');
    if (targetUserId === null) return;
    const requesterId = req.user!.userId;
    const requesterRoles = req.user!.roles;
    const isStaff = hasAnyRole(requesterRoles, ['MANAGEMENT', 'ADMIN']);
    if (!isStaff && requesterId !== targetUserId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const transactions = await creditService.getCreditTransactions(targetUserId);
    res.json(transactions);
  }

  async addCredit(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const targetUserId = parseIntParam(req.params.userId, res, 'user');
    if (targetUserId === null) return;
    const { amount, note } = req.body;
    const createdBy = req.user!.userId;
    const transaction = await creditService.addCredit(targetUserId, amount, note, createdBy);
    const newBalance = await creditService.getUserCreditBalance(targetUserId);
    res.status(201).json({ transaction, newBalance });
  }

  async removeCredit(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const targetUserId = parseIntParam(req.params.userId, res, 'user');
    if (targetUserId === null) return;
    const { amount, note } = req.body;
    const createdBy = req.user!.userId;
    const transaction = await creditService.removeCredit(targetUserId, amount, note, createdBy);
    const newBalance = await creditService.getUserCreditBalance(targetUserId);
    res.status(201).json({ transaction, newBalance });
  }
}

export default new CreditController();
