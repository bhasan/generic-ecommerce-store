import { Prisma } from '../../generated/prisma';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// A Prisma client or interactive-transaction client — both expose the models we touch.
type CreditClient = Pick<typeof prisma, 'user' | 'creditTransaction'>;

interface CreditChangeFields {
  type: 'ADDED' | 'USED' | 'REFUNDED' | 'REMOVED';
  note?: string;
  orderId?: number;
  createdBy?: number;
}

export class CreditService {
  async getUserCreditBalance(userId: number): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true }
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user.creditBalance.toNumber();
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
      amount: t.amount.toNumber(),
      balanceAfter: t.balanceAfter.toNumber(),
      createdByUsername: t.createdBy != null ? (staffMap.get(t.createdBy) ?? null) : null
    }));
  }

  /**
   * Applies a signed credit delta atomically: reads the current balance, computes the
   * resulting balance, writes a ledger entry with `balanceAfter`, and updates the cached
   * `creditBalance` — all in Decimal so money never drifts.
   */
  private async applyCreditChange(
    client: CreditClient,
    userId: number,
    delta: Prisma.Decimal,
    fields: CreditChangeFields,
    insufficientMessage?: string
  ) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true }
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const newBalance = user.creditBalance.add(delta);
    if (newBalance.isNegative()) {
      throw new AppError(insufficientMessage ?? 'Insufficient credit balance', 400);
    }

    await client.user.update({
      where: { id: userId },
      data: { creditBalance: newBalance }
    });

    return client.creditTransaction.create({
      data: { userId, amount: delta, balanceAfter: newBalance, ...fields }
    });
  }

  async addCredit(userId: number, amount: number, note: string | undefined, createdBy: number) {
    if (amount <= 0) {
      throw new AppError('Amount must be greater than zero', 400);
    }

    logger.info('Adding credit to user', { userId, amount, createdBy });

    const transaction = await prisma.$transaction((tx) =>
      this.applyCreditChange(tx, userId, new Prisma.Decimal(amount), { type: 'ADDED', note, createdBy })
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
      this.applyCreditChange(
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
    tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
  ) {
    await this.applyCreditChange(
      tx,
      userId,
      new Prisma.Decimal(amount).negated(),
      { type: 'USED', orderId }
    );
  }

  async refundCredit(userId: number, amount: number, orderId: number, note: string) {
    logger.info('Refunding credit to user', { userId, amount, orderId });

    const transaction = await prisma.$transaction((tx) =>
      this.applyCreditChange(tx, userId, new Prisma.Decimal(amount), { type: 'REFUNDED', orderId, note })
    );

    logger.info('Credit refunded successfully', { userId, amount, orderId, transactionId: transaction.id });
    return transaction;
  }

  /**
   * Audit helper: the cached `creditBalance` should equal the sum of all ledger entries.
   * (Legacy balances seeded without a ledger history will report as unreconciled.)
   */
  async reconcileBalance(userId: number) {
    const [user, agg] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } }),
      prisma.creditTransaction.aggregate({ where: { userId }, _sum: { amount: true } })
    ]);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    const ledgerSum = agg._sum.amount ?? new Prisma.Decimal(0);
    return {
      cachedBalance: user.creditBalance.toNumber(),
      ledgerSum: ledgerSum.toNumber(),
      reconciled: user.creditBalance.equals(ledgerSum)
    };
  }
}

export default new CreditService();

