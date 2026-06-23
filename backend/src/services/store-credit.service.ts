import { Prisma } from '../../generated/prisma';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// A Prisma client or interactive-transaction client — both expose the models we touch.
type StoreCreditClient = Pick<typeof prisma, 'user' | 'storeCreditTransaction'>;

interface StoreCreditChangeFields {
  type: 'ADDED' | 'USED' | 'REFUNDED' | 'REMOVED';
  note?: string;
  orderId?: number;
  createdBy?: number;
}

export class StoreCreditService {
  async getUserCreditBalance(userId: number): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { storeCreditBalance: true }
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user.storeCreditBalance.toNumber();
  }

  async getStoreCreditTransactions(userId: number) {
    const transactions = await prisma.storeCreditTransaction.findMany({
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
      amount: t.amount.toNumber(),
      balanceAfter: t.balanceAfter.toNumber(),
      createdByUsername: t.createdBy != null ? (staffMap.get(t.createdBy) ?? null) : null
    }));
  }

  /**
   * Applies a signed credit delta atomically: reads the current balance, computes the
   * resulting balance, writes a ledger entry with `balanceAfter`, and updates the cached
   * `storeCreditBalance` — all in Decimal so money never drifts.
   */
  private async applyStoreCreditChange(
    client: StoreCreditClient,
    userId: number,
    delta: Prisma.Decimal,
    fields: StoreCreditChangeFields,
    insufficientMessage?: string
  ) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { storeCreditBalance: true }
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const newBalance = user.storeCreditBalance.add(delta);
    if (newBalance.isNegative()) {
      throw new AppError(insufficientMessage ?? 'Insufficient credit balance', 400);
    }

    await client.user.update({
      where: { id: userId },
      data: { storeCreditBalance: newBalance }
    });

    return client.storeCreditTransaction.create({
      data: { userId, amount: delta, balanceAfter: newBalance, ...fields }
    });
  }

  async addCredit(userId: number, amount: number, note: string | undefined, createdBy: number) {
    if (amount <= 0) {
      throw new AppError('Amount must be greater than zero', 400);
    }

    logger.info('Adding credit to user', { userId, amount, createdBy });

    const transaction = await prisma.$transaction((tx) =>
      this.applyStoreCreditChange(tx, userId, new Prisma.Decimal(amount), { type: 'ADDED', note, createdBy })
    );

    logger.info('Credit added successfully', { userId, amount, transactionId: transaction.id });
    return transaction;
  }

  async removeCredit(userId: number, amount: number, note: string | undefined, createdBy: number) {
    if (amount <= 0) {
      throw new AppError('Amount must be greater than zero', 400);
    }

    logger.info('Removing credit from user', { userId, amount, createdBy });

    const delta = new Prisma.Decimal(amount).negated();
    const transaction = await prisma.$transaction((tx) =>
      this.applyStoreCreditChange(
        tx,
        userId,
        delta,
        { type: 'REMOVED', note, createdBy },
        `Cannot remove $${amount.toFixed(2)} — balance is too low`
      )
    );

    logger.info('Credit removed successfully', { userId, amount, transactionId: transaction.id });
    return transaction;
  }

  async useCredit(
    userId: number,
    amount: number,
    orderId: number,
    tx: StoreCreditClient
  ) {
    await this.applyStoreCreditChange(
      tx,
      userId,
      new Prisma.Decimal(amount).negated(),
      { type: 'USED', orderId }
    );
  }

  async refundCredit(userId: number, amount: number, orderId: number, note: string) {
    logger.info('Refunding credit to user', { userId, amount, orderId });

    const transaction = await prisma.$transaction((tx) =>
      this.applyStoreCreditChange(tx, userId, new Prisma.Decimal(amount), { type: 'REFUNDED', orderId, note })
    );

    logger.info('Credit refunded successfully', { userId, amount, orderId, transactionId: transaction.id });
    return transaction;
  }

  /**
   * Audit helper: the cached `storeCreditBalance` should equal the sum of all ledger entries.
   * (Legacy balances seeded without a ledger history will report as unreconciled.)
   */
  async reconcileBalance(userId: number) {
    const [user, agg] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { storeCreditBalance: true } }),
      prisma.storeCreditTransaction.aggregate({ where: { userId }, _sum: { amount: true } })
    ]);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    const ledgerSum = agg._sum.amount ?? new Prisma.Decimal(0);
    return {
      cachedBalance: user.storeCreditBalance.toNumber(),
      ledgerSum: ledgerSum.toNumber(),
      reconciled: user.storeCreditBalance.equals(ledgerSum)
    };
  }
}

export const storeCreditService = new StoreCreditService();
export default storeCreditService;
