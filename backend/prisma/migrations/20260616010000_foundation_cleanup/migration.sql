-- Foundation cleanup (Phase 1): foreign keys, Decimal money, indexes,
-- delivery-zone field dedupe/rename, review votes -> join table, print_jobs naming.
--
-- DATA-PRESERVING for existing prod data (users, products, orders, print jobs):
-- column renames use RENAME COLUMN (not drop+add); money casts preserve values;
-- new NOT NULL columns are backfilled before the constraint is applied.

-- CreateEnum
CREATE TYPE "ReviewVoteKind" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- DropIndex (recreated on renamed camelCase columns below)
DROP INDEX "print_jobs_status_created_at_idx";
DROP INDEX "print_jobs_claimed_by_agent_id_idx";

-- Users: rename delivery-zone columns (preserve data) + creditBalance -> Decimal
ALTER TABLE "users" RENAME COLUMN "deliveryZoneStatus" TO "deliveryStatus";
ALTER TABLE "users" RENAME COLUMN "deliveryZoneSource" TO "deliverySource";
ALTER TABLE "users" RENAME COLUMN "deliveryZoneDistanceMiles" TO "deliveryDistanceMiles";
ALTER TABLE "users" RENAME COLUMN "deliveryZoneCheckedAt" TO "deliveryCheckedAt";
ALTER TABLE "users" ALTER COLUMN "creditBalance" SET DATA TYPE DECIMAL(12,2);

-- Orders: rename delivery-zone columns (preserve) + total -> Decimal + new money columns
ALTER TABLE "orders" RENAME COLUMN "deliveryZoneStatus" TO "deliveryStatus";
ALTER TABLE "orders" RENAME COLUMN "deliveryEligibilitySource" TO "deliverySource";
ALTER TABLE "orders" RENAME COLUMN "deliveryZoneCheckedAt" TO "deliveryCheckedAt";
ALTER TABLE "orders" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "tax" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0;
-- Backfill legacy orders (had only `total`) so the subtotal isn't left at 0.
UPDATE "orders" SET "subtotal" = "total" WHERE "subtotal" = 0;

-- Credit transactions: amount -> Decimal + balanceAfter (backfill then enforce NOT NULL)
ALTER TABLE "credit_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "credit_transactions" ADD COLUMN "balanceAfter" DECIMAL(12,2);
UPDATE "credit_transactions" SET "balanceAfter" = 0 WHERE "balanceAfter" IS NULL;
ALTER TABLE "credit_transactions" ALTER COLUMN "balanceAfter" SET NOT NULL;

-- Reviews: drop vote arrays (moved to review_votes join table)
ALTER TABLE "reviews" DROP COLUMN "votedByHelpful";
ALTER TABLE "reviews" DROP COLUMN "votedByNotHelpful";
-- Safety: enforce one review per (user, product); if duplicates exist keep the newest.
DELETE FROM "reviews" a USING "reviews" b
WHERE a."userId" = b."userId" AND a."productId" = b."productId" AND a."id" < b."id";

-- Contact messages: userId becomes nullable (SetNull on user delete; snapshot retained)
ALTER TABLE "contact_messages" ALTER COLUMN "userId" DROP NOT NULL;

-- Print jobs: rename physical columns to camelCase (preserve queued/printed jobs)
ALTER TABLE "print_jobs" RENAME COLUMN "order_id" TO "orderId";
ALTER TABLE "print_jobs" RENAME COLUMN "payload_json" TO "payloadJson";
ALTER TABLE "print_jobs" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "print_jobs" RENAME COLUMN "claimed_at" TO "claimedAt";
ALTER TABLE "print_jobs" RENAME COLUMN "completed_at" TO "completedAt";
ALTER TABLE "print_jobs" RENAME COLUMN "failed_at" TO "failedAt";
ALTER TABLE "print_jobs" RENAME COLUMN "claimed_by_agent_id" TO "claimedByAgentId";
ALTER TABLE "print_jobs" RENAME COLUMN "native_job_id" TO "nativeJobId";
ALTER TABLE "print_jobs" RENAME COLUMN "attempt_count" TO "attemptCount";
ALTER TABLE "print_jobs" RENAME COLUMN "last_error_code" TO "lastErrorCode";
ALTER TABLE "print_jobs" RENAME COLUMN "last_error_message" TO "lastErrorMessage";

-- CreateTable
CREATE TABLE "review_votes" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" "ReviewVoteKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_votes_reviewId_userId_key" ON "review_votes"("reviewId", "userId");
CREATE INDEX "orders_userId_idx" ON "orders"("userId");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
CREATE INDEX "credit_transactions_userId_createdAt_idx" ON "credit_transactions"("userId", "createdAt");
CREATE INDEX "reviews_productId_idx" ON "reviews"("productId");
CREATE UNIQUE INDEX "reviews_userId_productId_key" ON "reviews"("userId", "productId");
CREATE INDEX "contact_messages_userId_idx" ON "contact_messages"("userId");
CREATE INDEX "contact_messages_status_idx" ON "contact_messages"("status");
CREATE INDEX "print_jobs_status_createdAt_idx" ON "print_jobs"("status", "createdAt");
CREATE INDEX "print_jobs_claimedByAgentId_idx" ON "print_jobs"("claimedByAgentId");

-- Clean orphaned rows so the new foreign keys can be added (defensive for prod).
-- Orphan orders (no owning user) are junk; remove before the RESTRICT FK.
DELETE FROM "orders" WHERE "userId" NOT IN (SELECT "id" FROM "users");
-- Transient print jobs whose order was deleted (52/53 on dev) — drop them.
DELETE FROM "print_jobs" WHERE "orderId" NOT IN (SELECT "id" FROM "orders");
DELETE FROM "user_roles" WHERE "userId" NOT IN (SELECT "id" FROM "users") OR "roleId" NOT IN (SELECT "id" FROM "roles");
DELETE FROM "notifications" WHERE "recipientUserId" NOT IN (SELECT "id" FROM "users");
DELETE FROM "reviews" WHERE "userId" NOT IN (SELECT "id" FROM "users");
DELETE FROM "credit_transactions" WHERE "userId" NOT IN (SELECT "id" FROM "users");
-- Soft references: null out dangling pointers instead of deleting (SetNull semantics).
UPDATE "contact_messages" SET "userId" = NULL WHERE "userId" IS NOT NULL AND "userId" NOT IN (SELECT "id" FROM "users");
UPDATE "contact_messages" SET "orderId" = NULL WHERE "orderId" IS NOT NULL AND "orderId" NOT IN (SELECT "id" FROM "orders");
UPDATE "credit_transactions" SET "createdBy" = NULL WHERE "createdBy" IS NOT NULL AND "createdBy" NOT IN (SELECT "id" FROM "users");
UPDATE "credit_transactions" SET "orderId" = NULL WHERE "orderId" IS NOT NULL AND "orderId" NOT IN (SELECT "id" FROM "orders");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

