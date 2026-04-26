import { Request, Response, NextFunction } from 'express';
import { printJobService } from '../services/printJob.service';
import { AppError } from '../middleware/error.middleware';

export class PrintJobController {
  async claimNextJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = this.requireString(req.body.agentId, 'agentId');
      const job = await printJobService.claimNextJob({ agentId });
      res.status(200).json({ job });
    } catch (error) {
      next(error);
    }
  }

  async markSuccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = this.parseId(req.params.id);
      const agentId = this.requireString(req.body.agentId, 'agentId');
      const nativeJobId = typeof req.body.nativeJobId === 'string' ? req.body.nativeJobId : undefined;
      const job = await printJobService.markSuccess(id, { agentId, nativeJobId });
      res.status(200).json({ job });
    } catch (error) {
      next(error);
    }
  }

  async markFailure(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = this.parseId(req.params.id);
      const agentId = this.requireString(req.body.agentId, 'agentId');
      const errorCode = this.requireString(req.body.errorCode, 'errorCode');
      const errorMessage = this.requireString(req.body.errorMessage, 'errorMessage');
      const job = await printJobService.markFailure(id, { agentId, errorCode, errorMessage });
      res.status(200).json({ job });
    } catch (error) {
      next(error);
    }
  }

  private parseId(rawId: string) {
    const id = parseInt(rawId, 10);
    if (Number.isNaN(id)) {
      throw new AppError('Invalid print job ID', 400, 'INVALID_PRINT_JOB_ID');
    }
    return id;
  }

  private requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new AppError(`${fieldName} is required`, 400, 'INVALID_PRINT_JOB_REQUEST');
    }
    return value.trim();
  }
}

export default new PrintJobController();
