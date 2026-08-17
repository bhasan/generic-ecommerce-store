import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { getTenantContext, MissingTenantContextError } from '../config/tenantContext';

type PrintJobRow = {
  id: number;
  orderId: number;
  reason: string;
  status: string;
  payloadJson: unknown;
  createdAt: Date;
  claimedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  claimedByAgentId: string | null;
  nativeJobId: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

interface CreatePrintJobData {
  orderId: number;
  reason: 'ORDER_CREATED' | 'MANUAL_REPRINT';
  payload: unknown;
}

interface ClaimNextJobData {
  agentId: string;
}

interface MarkPrintJobSuccessData {
  agentId: string;
  nativeJobId?: string;
}

interface MarkPrintJobFailureData {
  agentId: string;
  errorCode: string;
  errorMessage: string;
}

export class PrintJobService {
  async createPrintJob(data: CreatePrintJobData) {
    const job = await prisma.printJob.create({
      data: {
        orderId: data.orderId,
        reason: data.reason,
        status: 'PENDING',
        payloadJson: data.payload as any,
      },
    });

    logger.info('Print job queued', {
      printJobId: job.id,
      orderId: job.orderId,
      reason: job.reason,
    });

    return job;
  }

  async claimNextJob(data: ClaimNextJobData) {
    const ctx = getTenantContext();
    if (!ctx) throw new MissingTenantContextError();

    const rows = await prisma.$queryRaw<PrintJobRow[]>`
      UPDATE "print_jobs"
      SET
        "status" = 'CLAIMED'::"PrintJobStatus",
        "claimedByAgentId" = ${data.agentId},
        "claimedAt" = NOW(),
        "completedAt" = NULL,
        "failedAt" = NULL
      WHERE "id" = (
        SELECT "id"
        FROM "print_jobs"
        WHERE
          ("status" = 'PENDING'::"PrintJobStatus"
          OR (
            "status" = 'CLAIMED'::"PrintJobStatus"
            AND "claimedAt" < NOW() - INTERVAL '5 minutes'
          ))
          AND "tenantId" = ${ctx.tenantId}
          AND "storeId" = ${ctx.storeId}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING
        "id",
        "orderId",
        "reason"::text AS "reason",
        "status"::text AS "status",
        "payloadJson",
        "createdAt",
        "claimedAt",
        "completedAt",
        "failedAt",
        "claimedByAgentId",
        "nativeJobId",
        "attemptCount",
        "lastErrorCode",
        "lastErrorMessage"
    `;

    const job = rows[0] ? this.mapPrintJobRow(rows[0]) : null;

    if (job) {
      logger.info('Print job claimed', {
        printJobId: job.id,
        orderId: job.orderId,
        reason: job.reason,
        agentId: data.agentId,
      });
    }

    return job;
  }

  async markSuccess(id: number, data: MarkPrintJobSuccessData) {
    const result = await prisma.printJob.updateMany({
      where: {
        id,
        status: 'CLAIMED',
        claimedByAgentId: data.agentId,
      },
      data: {
        status: 'PRINTED',
        completedAt: new Date(),
        failedAt: null,
        nativeJobId: data.nativeJobId || null,
      },
    });

    if (result.count === 0) {
      throw new AppError('Print job not found for this agent', 404, 'PRINT_JOB_NOT_FOUND');
    }

    logger.info('Print job marked printed', {
      printJobId: id,
      agentId: data.agentId,
      nativeJobId: data.nativeJobId || null,
    });

    return prisma.printJob.findUnique({ where: { id } });
  }

  async markFailure(id: number, data: MarkPrintJobFailureData) {
    const result = await prisma.printJob.updateMany({
      where: {
        id,
        status: 'CLAIMED',
        claimedByAgentId: data.agentId,
      },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        attemptCount: { increment: 1 },
        lastErrorCode: data.errorCode,
        lastErrorMessage: data.errorMessage,
      },
    });

    if (result.count === 0) {
      throw new AppError('Print job not found for this agent', 404, 'PRINT_JOB_NOT_FOUND');
    }

    logger.warn('Print job marked failed', {
      printJobId: id,
      agentId: data.agentId,
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
    });

    return prisma.printJob.findUnique({ where: { id } });
  }

  private mapPrintJobRow(row: PrintJobRow) {
    return {
      id: row.id,
      orderId: row.orderId,
      reason: row.reason,
      status: row.status,
      payloadJson: row.payloadJson,
      createdAt: row.createdAt,
      claimedAt: row.claimedAt,
      completedAt: row.completedAt,
      failedAt: row.failedAt,
      claimedByAgentId: row.claimedByAgentId,
      nativeJobId: row.nativeJobId,
      attemptCount: row.attemptCount,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
    };
  }
}

export const printJobService = new PrintJobService();
