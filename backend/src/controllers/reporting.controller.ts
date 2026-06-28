import { Request, Response } from 'express';
import { reportingService } from '../services/reporting.service';
import { buildReportingEnvelope } from '../utils/reportingEnvelope';
import { paginateRows, parseReportingPagination } from '../utils/reportingPagination';
import { parseIsoDateParam } from '../utils/reportingTime';
import { successResponse } from '../utils/responseEnvelope';

const parseDateFilters = (req: Request) => ({
  updatedSince: parseIsoDateParam(req.query.updated_since, 'updated_since'),
  createdSince: parseIsoDateParam(req.query.created_since, 'created_since'),
  createdUntil: parseIsoDateParam(req.query.created_until, 'created_until'),
  placedSince: parseIsoDateParam(req.query.placed_since, 'placed_since'),
  placedUntil: parseIsoDateParam(req.query.placed_until, 'placed_until'),
  status: typeof req.query.status === 'string' ? req.query.status : undefined,
});

export class ReportingController {
  health(_req: Request, res: Response): void {
    res.status(200).json(successResponse(reportingService.getHealth()));
  }

  metadata(_req: Request, res: Response): void {
    res.status(200).json(successResponse(reportingService.getMetadata()));
  }

  async products(req: Request, res: Response): Promise<void> {
    const paginationInput = parseReportingPagination(req);
    const rows = await reportingService.listProducts(paginationInput, parseDateFilters(req));
    const result = paginateRows(rows, paginationInput);
    res.status(200).json(successResponse(buildReportingEnvelope(req, result.data, result.pagination)));
  }

  async categories(req: Request, res: Response): Promise<void> {
    const paginationInput = parseReportingPagination(req);
    const rows = await reportingService.listCategories(paginationInput, parseDateFilters(req));
    const result = paginateRows(rows, paginationInput);
    res.status(200).json(successResponse(buildReportingEnvelope(req, result.data, result.pagination)));
  }

  async inventorySnapshots(req: Request, res: Response): Promise<void> {
    const paginationInput = parseReportingPagination(req);
    const rows = await reportingService.listInventorySnapshots(paginationInput, parseDateFilters(req));
    const result = paginateRows(rows, paginationInput);
    res.status(200).json(successResponse(buildReportingEnvelope(req, result.data, result.pagination, {
      source_type: 'snapshot',
      movement_history_supported: false,
    })));
  }

  async orders(req: Request, res: Response): Promise<void> {
    const paginationInput = parseReportingPagination(req);
    const rows = await reportingService.listOrders(paginationInput, parseDateFilters(req));
    const result = paginateRows(rows, paginationInput);
    res.status(200).json(successResponse(buildReportingEnvelope(req, result.data, result.pagination)));
  }

  async refunds(req: Request, res: Response): Promise<void> {
    const paginationInput = parseReportingPagination(req);
    const rows = await reportingService.listRefunds();
    const result = paginateRows(rows, paginationInput);
    res.status(200).json(successResponse(buildReportingEnvelope(req, result.data, result.pagination, {
      refunds_supported: false,
      limitation: 'The current online store schema does not have a first-class refund model. Cancellations are represented through order status where available.',
    })));
  }
}

export default new ReportingController();
