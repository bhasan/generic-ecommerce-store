import { Request } from 'express';
import { getReportingConfig } from './reportingConfig';
import { toUtcIso } from './reportingTime';
import { ReportingPaginationMeta } from './reportingPagination';

export const buildReportingMeta = (req: Request, extra?: Record<string, unknown>) => {
  const config = getReportingConfig();
  return {
    request_id: req.requestId || 'unknown',
    generated_at: toUtcIso(new Date()),
    source_system: config.sourceSystem,
    provider_key: config.providerKey,
    schema_version: config.schemaVersion,
    ...(extra || {}),
  };
};

export const buildReportingEnvelope = <T>(
  req: Request,
  data: T[],
  pagination: ReportingPaginationMeta,
  extraMeta?: Record<string, unknown>
) => ({
  data,
  pagination,
  meta: buildReportingMeta(req, extraMeta),
});

export const buildReportingError = (req: Request, message: string, code: string) => ({
  error: {
    message,
    code,
    request_id: req.requestId || 'unknown',
  },
});
