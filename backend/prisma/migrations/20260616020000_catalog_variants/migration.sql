-- Phase 2: Catalog Product -> Variant.
-- DATA-PRESERVING: each existing product becomes a Product + one default UNIT/WEIGHT
-- variant (price/stock carried over); thumbnail/images -> product_images;
-- allowedQuantitiesOverride -> variant_quantity_options; order/cart items remapped to
-- the product's default variant. JSON quantity-discounts are NOT converted (admin re-adds
-- price breaks via the UI).

-- CreateEnum
CREATE TYPE "CardSize" AS ENUM ('STANDARD', 'WIDE', 'TALL', 'LARGE');
CREATE TYPE "ImageRole" AS ENUM ('THUMBNAIL', 'GALLERY');
CREATE TYPE "PricingMode" AS ENUM ('UNIT', 'WEIGHT');

-- New variant/image tables (empty; populated by backfill below)
CREATE TABLE "product_variants" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'UNIT',
    "basePrice" DECIMAL(12,2) NOT NULL,
    "stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stockEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "role" "ImageRole" NOT NULL DEFAULT 'GALLERY',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "variant_quantity_options" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "variant_quantity_options_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "variant_price_breaks" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "minQuantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "variant_price_breaks_pkey" PRIMARY KEY ("id")
);

-- Products: add slug + enum cardSize (preserve existing string value)
ALTER TABLE "products" ADD COLUMN "slug" TEXT;
ALTER TABLE "products" ADD COLUMN "cardSizeEnum" "CardSize" NOT NULL DEFAULT 'STANDARD';
UPDATE "products" SET "cardSizeEnum" = CASE upper("cardSize")
  WHEN 'WIDE' THEN 'WIDE'::"CardSize"
  WHEN 'TALL' THEN 'TALL'::"CardSize"
  WHEN 'LARGE' THEN 'LARGE'::"CardSize"
  ELSE 'STANDARD'::"CardSize" END;
-- slug from name, then ensure uniqueness
UPDATE "products" SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'));
UPDATE "products" SET "slug" = 'product' WHERE "slug" IS NULL OR "slug" = '';
UPDATE "products" p SET "slug" = p."slug" || '-' || p."id"
  WHERE EXISTS (SELECT 1 FROM "products" p2 WHERE p2."slug" = p."slug" AND p2."id" <> p."id");

-- Backfill: one default variant per product (WEIGHT if it had allowed quantities)
INSERT INTO "product_variants"
  ("productId", "label", "sku", "pricingMode", "basePrice", "stock", "stockEnabled", "isDefault", "active", "sortOrder", "createdAt", "updatedAt")
SELECT
  p."id", 'Default', 'SKU-' || p."id",
  (CASE WHEN COALESCE(array_length(p."allowedQuantitiesOverride", 1), 0) > 0 THEN 'WEIGHT' ELSE 'UNIT' END)::"PricingMode",
  p."price"::numeric(12,2), p."stock"::numeric(12,3), p."stockEnabled", true, true, 0, NOW(), NOW()
FROM "products" p;

-- Allowed quantities -> variant_quantity_options
INSERT INTO "variant_quantity_options" ("variantId", "quantity", "sortOrder")
SELECT v."id", q.qty::numeric(12,3), (q.ord - 1)::int
FROM "products" p
JOIN "product_variants" v ON v."productId" = p."id" AND v."isDefault"
JOIN LATERAL unnest(p."allowedQuantitiesOverride") WITH ORDINALITY AS q(qty, ord) ON true;

-- Images: thumbnail -> THUMBNAIL, images[] -> GALLERY
INSERT INTO "product_images" ("productId", "url", "role", "sortOrder")
SELECT p."id", p."thumbnail", 'THUMBNAIL', 0 FROM "products" p
WHERE p."thumbnail" IS NOT NULL AND p."thumbnail" <> '';
INSERT INTO "product_images" ("productId", "url", "role", "sortOrder")
SELECT p."id", img.url, 'GALLERY', img.ord::int FROM "products" p
JOIN LATERAL unnest(p."images") WITH ORDINALITY AS img(url, ord) ON true
WHERE img.url IS NOT NULL AND img.url <> '';

-- Remap order_items to the product's default variant (drop orphans first)
DELETE FROM "order_items" WHERE "productId" NOT IN (SELECT "id" FROM "products");
ALTER TABLE "order_items" ADD COLUMN "variantId" INTEGER;
ALTER TABLE "order_items" ADD COLUMN "productName" TEXT;
ALTER TABLE "order_items" ADD COLUMN "variantLabel" TEXT;
ALTER TABLE "order_items" ADD COLUMN "unitPrice" DECIMAL(12,2);
UPDATE "order_items" oi SET
  "variantId" = v."id",
  "productName" = p."name",
  "variantLabel" = v."label",
  "unitPrice" = oi."price"::numeric(12,2)
FROM "products" p
JOIN "product_variants" v ON v."productId" = p."id" AND v."isDefault"
WHERE oi."productId" = p."id";
ALTER TABLE "order_items" ALTER COLUMN "variantId" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "productName" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "variantLabel" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "unitPrice" SET NOT NULL;
ALTER TABLE "order_items" DROP COLUMN "productId";
ALTER TABLE "order_items" DROP COLUMN "price";

-- Remap cart_items to the product's default variant
DELETE FROM "cart_items" WHERE "productId" NOT IN (SELECT "id" FROM "products");
DROP INDEX "cart_items_userId_productId_key";
ALTER TABLE "cart_items" ADD COLUMN "variantId" INTEGER;
ALTER TABLE "cart_items" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "cart_items" ci SET "variantId" = v."id"
FROM "product_variants" v WHERE v."productId" = ci."productId" AND v."isDefault";
-- Collapse any duplicate (userId, variant) rows the remap may produce
DELETE FROM "cart_items" a USING "cart_items" b
WHERE a."userId" = b."userId" AND a."variantId" = b."variantId" AND a."id" > b."id";
ALTER TABLE "cart_items" ALTER COLUMN "variantId" SET NOT NULL;
ALTER TABLE "cart_items" DROP COLUMN "productId";

-- Drop legacy product columns now that everything is migrated
ALTER TABLE "products"
  DROP COLUMN "price",
  DROP COLUMN "stock",
  DROP COLUMN "stockEnabled",
  DROP COLUMN "thumbnail",
  DROP COLUMN "image",
  DROP COLUMN "images",
  DROP COLUMN "allowedQuantitiesOverride",
  DROP COLUMN "quantityDiscountsOverride",
  DROP COLUMN "cardSize";
ALTER TABLE "products" RENAME COLUMN "cardSizeEnum" TO "cardSize";
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;

-- Categories: drop pricing defaults, add slug, tighten parent FK to Restrict
ALTER TABLE "categories" DROP CONSTRAINT "categories_parentId_fkey";
ALTER TABLE "categories" DROP COLUMN "allowedQuantities";
ALTER TABLE "categories" DROP COLUMN "quantityDiscounts";
ALTER TABLE "categories" ADD COLUMN "slug" TEXT;

-- Indexes
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");
CREATE UNIQUE INDEX "variant_quantity_options_variantId_quantity_key" ON "variant_quantity_options"("variantId", "quantity");
CREATE UNIQUE INDEX "variant_price_breaks_variantId_minQuantity_key" ON "variant_price_breaks"("variantId", "minQuantity");
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX "order_items_variantId_idx" ON "order_items"("variantId");
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
CREATE UNIQUE INDEX "cart_items_userId_variantId_key" ON "cart_items"("userId", "variantId");

-- Foreign keys
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_quantity_options" ADD CONSTRAINT "variant_quantity_options_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_price_breaks" ADD CONSTRAINT "variant_price_breaks_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

