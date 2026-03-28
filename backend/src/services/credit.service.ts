import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export class CreditService {
  async getUserCreditBalance(userId: number): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true }
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user.creditBalance;
  }

  async getCreditTransactions(userId: number) {
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    // Attach username for the staff member who added credit
    const createdByIds = [...new Set(
      transactions.map(t => t.createdBy).filter((id): id is number => id !== null)
    )];

    const staffUsers = createdByIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: createdByIds } },
          select: { id: true, username: true }
        })
      : [];

    const staffMap = new Map(staffUsers.map(u => [u.id, u.username]));

    return transactions.map(t => ({
      ...t,
      createdByUsername: t.createdBy != null ? (staffMap.get(t.createdBy) ?? null) : null
    }));
  }

  async addCredit(userId: number, amount: number, note: string | undefined, createdBy: number) {
    if (amount <= 0) {
      throw new AppError('Amount must be greater than zero', 400);
    }

    logger.info('Adding credit to user', { userId, amount, createdBy });

    const [transaction] = await prisma.$transaction([
      prisma.creditTransaction.create({
        data: { userId, amount, type: 'ADDED', note, createdBy }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { creditBalance: { increment: amount } }
      })
    ]);

    logger.info('Credit added successfully', { userId, amount, transactionId: transaction.id });
    return transaction;
  }

  async removeCredit(userId: number, amount: number, note: string | undefined, createdBy: number) {
    if (amount <= 0) {
      throw new AppError('Amount must be greater than zero', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.creditBalance < amount) {
      throw new AppError(`Cannot remove $${amount.toFixed(2)} — current balance is $${user.creditBalance.toFixed(2)}`, 400);
    }

    logger.info('Removing credit from user', { userId, amount, createdBy });

    const [transaction] = await prisma.$transaction([
      prisma.creditTransaction.create({
        data: { userId, amount: -amount, type: 'REMOVED', note, createdBy }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { creditBalance: { decrement: amount } }
      })
    ]);

    logger.info('Credit removed successfully', { userId, amount, transactionId: transaction.id });
    return transaction;
  }

  async useCredit(
    userId: number,
    amount: number,
    orderId: number,
    tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
  ) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.creditBalance < amount) {
      throw new AppError('Insufficient credit balance', 400);
    }

    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { decrement: amount } }
    });

    await tx.creditTransaction.create({
      data: { userId, amount: -amount, type: 'USED', orderId }
    });
  }

  async refundCredit(userId: number, amount: number, orderId: number, note: string) {
    logger.info('Refunding credit to user', { userId, amount, orderId });

    const [transaction] = await prisma.$transaction([
      prisma.creditTransaction.create({
        data: { userId, amount, type: 'REFUNDED', orderId, note }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { creditBalance: { increment: amount } }
      })
    ]);

    logger.info('Credit refunded successfully', { userId, amount, orderId, transactionId: transaction.id });
    return transaction;
  }
}

export default new CreditService();
