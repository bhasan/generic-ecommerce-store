-- store_settings becomes per-store: storeId 0 = tenant default (the default store's
-- settings, inherited by other stores); a real storeId = a non-default store override.
-- No FK to stores: the column stores the sentinel 0 (see concern #2 — app-level integrity).
ALTER TABLE "ui_settings" ADD COLUMN "storeId" INTEGER;
UPDATE "ui_settings" SET "storeId" = 0 WHERE "storeId" IS NULL;
DROP INDEX "ui_settings_tenantId_key_key";
CREATE UNIQUE INDEX "ui_settings_tenantId_storeId_key_key" ON "ui_settings"("tenantId", "storeId", "key");
CREATE INDEX "ui_settings_storeId_idx" ON "ui_settings"("storeId");
