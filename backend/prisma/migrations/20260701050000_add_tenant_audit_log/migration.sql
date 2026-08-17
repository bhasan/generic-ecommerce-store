-- CreateTable
CREATE TABLE "tenant_audit_log" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "targetTenantId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "actorUsername" TEXT NOT NULL,
    "requestId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_audit_log_targetTenantId_createdAt_idx" ON "tenant_audit_log"("targetTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_audit_log_createdAt_idx" ON "tenant_audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "tenant_audit_log" ADD CONSTRAINT "tenant_audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
