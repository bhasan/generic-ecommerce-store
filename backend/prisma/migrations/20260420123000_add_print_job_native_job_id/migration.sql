ALTER TABLE "print_jobs"
  ADD COLUMN IF NOT EXISTS "native_job_id" TEXT;
