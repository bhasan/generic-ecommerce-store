import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

type PrintJobRow = {
  id: number;
  order_id: number;
  reason: string;
  status: string;
  payload_json: unknown;
  created_at: Date;
  claimed_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  claimed_by_agent_id: string | null;
  native_job_id: string | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
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
    const rows = await prisma.$queryRaw<PrintJobRow[]>`
      UPDATE "print_jobs"
      SET
        "status" = 'CLAIMED'::"PrintJobStatus",
        "claimed_by_agent_id" = ${data.agentId},
        "claimed_at" = NOW(),
        "completed_at" = NULL,
        "failed_at" = NULL
      WHERE "id" = (
        SELECT "id"
        FROM "print_jobs"
        WHERE
          "status" = 'PENDING'::"PrintJobStatus"
          OR (
            "status" = 'CLAIMED'::"PrintJobStatus"
            AND "claimed_at" < NOW() - INTERVAL '5 minutes'
          )
        ORDER BY "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING
        "id",
        "order_id",
        "reason"::text AS "reason",
        "status"::text AS "status",
        "payload_json",
        "created_at",
        "claimed_at",
        "completed_at",
        "failed_at",
        "claimed_by_agent_id",
        "native_job_id",
        "attempt_count",
        "last_error_code",
        "last_error_message"
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
      orderId: row.order_id,
      reason: row.reason,
      status: row.status,
      payloadJson: row.payload_json,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      claimedByAgentId: row.claimed_by_agent_id,
      nativeJobId: row.native_job_id,
      attemptCount: row.attempt_count,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
    };
  }
}

export const printJobService = new PrintJobService();
