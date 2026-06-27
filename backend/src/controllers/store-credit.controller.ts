import { Request, Response } from 'express';
import storeCreditService from '../services/store-credit.service';
import { hasAnyRole } from '../constants/roles';
import { validateRequest } from '../utils/request.util';

export class StoreCreditController {
  async getBalance(req: Request, res: Response) : Promise<void> {
    const targetUserId = parseInt(req.params.userId, 10);
    const requesterId = req.user!.userId;
    const requesterRoles = req.user!.roles;
    const isStaff = hasAnyRole(requesterRoles, ['MANAGEMENT', 'ADMIN']);
    if (!isStaff && requesterId !== targetUserId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const balance = await storeCreditService.getUserCreditBalance(targetUserId);
    res.json({ userId: targetUserId, balance });
  }

  async getTransactions(req: Request, res: Response) : Promise<void> {
    const targetUserId = parseInt(req.params.userId, 10);
    const requesterId = req.user!.userId;
    const requesterRoles = req.user!.roles;
    const isStaff = hasAnyRole(requesterRoles, ['MANAGEMENT', 'ADMIN']);
    if (!isStaff && requesterId !== targetUserId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const transactions = await storeCreditService.getStoreCreditTransactions(targetUserId);
    res.json(transactions);
  }

  async addCredit(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const targetUserId = parseInt(req.params.userId, 10);
    const { amount, note } = req.body;
    const createdBy = req.user!.userId;
    const transaction = await storeCreditService.addCredit(targetUserId, amount, note, createdBy);
    const newBalance = await storeCreditService.getUserCreditBalance(targetUserId);
    res.status(201).json({ transaction, newBalance });
  }

  async removeCredit(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const targetUserId = parseInt(req.params.userId, 10);
    const { amount, note } = req.body;
    const createdBy = req.user!.userId;
    const transaction = await storeCreditService.removeCredit(targetUserId, amount, note, createdBy);
    const newBalance = await storeCreditService.getUserCreditBalance(targetUserId);
    res.status(201).json({ transaction, newBalance });
  }
}

export default new StoreCreditController();
