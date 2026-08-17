-- AlterEnum
-- Standalone: Postgres cannot use a freshly-added enum value in the same
-- transaction that adds it, so this migration only adds the value and
-- references it nowhere.
ALTER TYPE "TenantStatus" ADD VALUE 'DELETED';
