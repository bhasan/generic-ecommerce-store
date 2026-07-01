CREATE TABLE "store_variant_overrides" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "variantId" INTEGER NOT NULL,
  "stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "priceOverride" DECIMAL(12,2),
  "activeOverride" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_variant_overrides_stock_nonneg" CHECK ("stock" >= 0)
);
CREATE UNIQUE INDEX "store_variant_overrides_storeId_variantId_key" ON "store_variant_overrides"("storeId","variantId");
CREATE INDEX "store_variant_overrides_tenantId_idx" ON "store_variant_overrides"("tenantId");
CREATE INDEX "store_variant_overrides_variantId_idx" ON "store_variant_overrides"("variantId");
ALTER TABLE "store_variant_overrides" ADD CONSTRAINT "svo_store_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE;
ALTER TABLE "store_variant_overrides" ADD CONSTRAINT "svo_variant_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE;
