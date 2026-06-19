import { Request } from 'express';
import { AppError } from '../middleware/error.middleware';
import { getReportingConfig } from './reportingConfig';

export interface ReportingPaginationInput {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface ReportingPaginationMeta {
  page: number;
  page_size: number;
  has_next: boolean;
  next_page: number | null;
}

const parseOptionalPositiveInt = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError(`${fieldName} must be a positive integer`, 400, 'INVALID_QUERY');
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new AppError(`${fieldName} must be a positive integer`, 400, 'INVALID_QUERY');
  }
  return parsed;
};

export const parseReportingPagination = (req: Request): ReportingPaginationInput => {
  const config = getReportingConfig();
  const page = parseOptionalPositiveInt(req.query.page, 'page') ?? 1;
  const requestedPageSize = parseOptionalPositiveInt(req.query.page_size, 'page_size') ?? config.defaultPageSize;
  const pageSize = Math.min(requestedPageSize, config.maxPageSize);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  };
};

export const paginateRows = <T>(
  rows: T[],
  pagination: ReportingPaginationInput
): { data: T[]; pagination: ReportingPaginationMeta } => {
  const hasNext = rows.length > pagination.pageSize;
  return {
    data: rows.slice(0, pagination.pageSize),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      has_next: hasNext,
      next_page: hasNext ? pagination.page + 1 : null,
    },
  };
};
