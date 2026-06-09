DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrintJobReason') THEN
    CREATE TYPE "PrintJobReason" AS ENUM ('ORDER_CREATED', 'MANUAL_REPRINT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrintJobStatus') THEN
    CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'PRINTED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "print_jobs" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER NOT NULL,
  "reason" "PrintJobReason" NOT NULL,
  "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
  "payload_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "claimed_by_agent_id" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  "last_error_message" TEXT
);

CREATE INDEX IF NOT EXISTS "print_jobs_status_created_at_idx" ON "print_jobs" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "print_jobs_claimed_by_agent_id_idx" ON "print_jobs" ("claimed_by_agent_id");
