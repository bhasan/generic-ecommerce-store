export const REPORTING_PROVIDER_KEY = 'ONLINE_STORE';
export const REPORTING_SOURCE_SYSTEM = 'online_store';
export const REPORTING_SOURCE_DISPLAY_NAME = 'Online Store';
export const DEFAULT_REPORTING_SCHEMA_VERSION = '2026-06-online-store-reporting-v1';
export const DEFAULT_REPORTING_TIMEZONE = 'America/Chicago';
export const DEFAULT_REPORTING_CURRENCY = 'USD';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getReportingConfig = () => {
  const maxPageSize = parsePositiveInt(process.env.ONLINE_STORE_REPORTING_API_MAX_PAGE_SIZE, 250);
  const defaultPageSize = Math.min(
    parsePositiveInt(process.env.ONLINE_STORE_REPORTING_API_DEFAULT_PAGE_SIZE, 100),
    maxPageSize
  );

  return {
    enabled: process.env.ONLINE_STORE_REPORTING_API_ENABLED === 'true',
    token: process.env.ONLINE_STORE_REPORTING_API_TOKEN || '',
    maxPageSize,
    defaultPageSize,
    rateLimitPerMinute: parsePositiveInt(process.env.ONLINE_STORE_REPORTING_API_RATE_LIMIT_PER_MINUTE, 120),
    includeCustomers: process.env.ONLINE_STORE_REPORTING_API_INCLUDE_CUSTOMERS === 'true',
    includePaymentDetails: process.env.ONLINE_STORE_REPORTING_API_INCLUDE_PAYMENT_DETAILS === 'true',
    schemaVersion: process.env.ONLINE_STORE_REPORTING_API_SCHEMA_VERSION || DEFAULT_REPORTING_SCHEMA_VERSION,
    providerKey: REPORTING_PROVIDER_KEY,
    sourceSystem: REPORTING_SOURCE_SYSTEM,
    sourceDisplayName: REPORTING_SOURCE_DISPLAY_NAME,
    timezone: DEFAULT_REPORTING_TIMEZONE,
    currency: DEFAULT_REPORTING_CURRENCY,
  };
};
