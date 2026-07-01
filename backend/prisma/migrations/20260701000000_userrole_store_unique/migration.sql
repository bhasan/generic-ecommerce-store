-- storeId 0 = "all stores"; migrate existing all-stores rows (null) to the sentinel
-- so the new unique index has no NULL-distinctness gap.
-- Drop the FK first: storeId=0 is a sentinel value, not a real stores row.
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_storeId_fkey";
UPDATE "user_roles" SET "storeId" = 0 WHERE "storeId" IS NULL;

-- Relax uniqueness so a user can hold the same role at multiple stores (one row per store).
DROP INDEX "user_roles_userId_roleId_key";
CREATE UNIQUE INDEX "user_roles_userId_roleId_storeId_key" ON "user_roles"("userId", "roleId", "storeId");
