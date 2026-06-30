-- Add per-tenant machine token hashes for reporting and print-agent authentication.
-- These columns store a SHA-256 hex digest of the plaintext token (never the token itself).
-- The plaintext token is returned once at provisioning / regeneration time.
ALTER TABLE "tenants" ADD COLUMN "reportingTokenHash" TEXT;
ALTER TABLE "tenants" ADD COLUMN "printAgentKeyHash" TEXT;
