-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- 1. Create Tenant and Store tables
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customDomain" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "tenants_customDomain_key" ON "tenants"("customDomain");
CREATE UNIQUE INDEX "stores_tenantId_slug_key" ON "stores"("tenantId", "slug");

ALTER TABLE "stores" ADD CONSTRAINT "stores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Add columns as NULLABLE initially so the database accepts them
ALTER TABLE "users" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "products" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "categories" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "product_variants" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "product_images" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "variant_quantity_options" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "variant_price_breaks" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "review_votes" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "store_credit_transactions" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "ui_settings" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "user_roles" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "notifications" ADD COLUMN "tenantId" INTEGER;

ALTER TABLE "orders" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "order_items" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "order_status_events" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "payments" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "cart_items" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "print_jobs" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "pos_outbox" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "order_pos_mappings" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;

ALTER TABLE "announcements" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;
ALTER TABLE "contact_messages" ADD COLUMN "tenantId" INTEGER, ADD COLUMN "storeId" INTEGER;

ALTER TABLE "user_roles" ADD COLUMN "storeId" INTEGER;

-- 3. Insert the Default Tenant + Default Store
INSERT INTO tenants (slug, name, status, "createdAt", "updatedAt")
VALUES ('app', 'Default Store', 'ACTIVE', now(), now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO stores ("tenantId", name, slug, "isDefault", status, "createdAt", "updatedAt")
SELECT t.id, 'Main', 'main', true, 'ACTIVE', now(), now()
FROM tenants t WHERE t.slug = 'app'
ON CONFLICT ("tenantId", slug) DO NOTHING;

-- 4. Backfill existing data to the Default Tenant / Store
UPDATE "products" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "categories" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "users" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "product_variants" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "product_images" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "variant_quantity_options" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "variant_price_breaks" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "reviews" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "review_votes" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "store_credit_transactions" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "ui_settings" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "user_roles" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;
UPDATE "notifications" SET "tenantId" = (SELECT id FROM tenants WHERE slug='app') WHERE "tenantId" IS NULL;

UPDATE "orders" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "order_items" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "order_status_events" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "payments" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "cart_items" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "print_jobs" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "pos_outbox" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "order_pos_mappings" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app'),
  "storeId"  = (SELECT s.id FROM stores s JOIN tenants t ON s."tenantId"=t.id WHERE t.slug='app' AND s."isDefault")
WHERE "tenantId" IS NULL OR "storeId" IS NULL;

UPDATE "announcements" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app')
WHERE "tenantId" IS NULL;

UPDATE "contact_messages" SET
  "tenantId" = (SELECT id FROM tenants WHERE slug='app')
WHERE "tenantId" IS NULL;

-- 5. Enforce NOT NULL now that every row is tagged
ALTER TABLE "products" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "product_variants" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "product_images" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "variant_quantity_options" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "variant_price_breaks" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "review_votes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "store_credit_transactions" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ui_settings" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "user_roles" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "orders" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "order_status_events" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "cart_items" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "print_jobs" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "pos_outbox" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "order_pos_mappings" ALTER COLUMN "tenantId" SET NOT NULL, ALTER COLUMN "storeId" SET NOT NULL;

-- 6. Drop global unique constraints and add composite unique constraints (Tenant-scoped)
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_slug_key";
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_slug_key" UNIQUE ("tenantId", "slug");

ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_slug_key";
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_slug_key" UNIQUE ("tenantId", "slug");

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_key";
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_username_key" UNIQUE ("tenantId", "username");

-- 7. Add Foreign Key constraints and Indexes
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_quantity_options" ADD CONSTRAINT "variant_quantity_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_price_breaks" ADD CONSTRAINT "variant_price_breaks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_credit_transactions" ADD CONSTRAINT "store_credit_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ui_settings" ADD CONSTRAINT "ui_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_outbox" ADD CONSTRAINT "pos_outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_outbox" ADD CONSTRAINT "pos_outbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_pos_mappings" ADD CONSTRAINT "order_pos_mappings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_pos_mappings" ADD CONSTRAINT "order_pos_mappings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");
CREATE INDEX "product_variants_tenantId_idx" ON "product_variants"("tenantId");
CREATE INDEX "product_images_tenantId_idx" ON "product_images"("tenantId");
CREATE INDEX "variant_quantity_options_tenantId_idx" ON "variant_quantity_options"("tenantId");
CREATE INDEX "variant_price_breaks_tenantId_idx" ON "variant_price_breaks"("tenantId");
CREATE INDEX "reviews_tenantId_idx" ON "reviews"("tenantId");
CREATE INDEX "review_votes_tenantId_idx" ON "review_votes"("tenantId");
CREATE INDEX "store_credit_transactions_tenantId_idx" ON "store_credit_transactions"("tenantId");
CREATE INDEX "ui_settings_tenantId_idx" ON "ui_settings"("tenantId");
CREATE INDEX "user_roles_tenantId_idx" ON "user_roles"("tenantId");
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

CREATE INDEX "orders_tenantId_idx" ON "orders"("tenantId");
CREATE INDEX "orders_storeId_idx" ON "orders"("storeId");
CREATE INDEX "order_items_tenantId_idx" ON "order_items"("tenantId");
CREATE INDEX "order_items_storeId_idx" ON "order_items"("storeId");
CREATE INDEX "order_status_events_tenantId_idx" ON "order_status_events"("tenantId");
CREATE INDEX "order_status_events_storeId_idx" ON "order_status_events"("storeId");
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");
CREATE INDEX "payments_storeId_idx" ON "payments"("storeId");
CREATE INDEX "cart_items_tenantId_idx" ON "cart_items"("tenantId");
CREATE INDEX "cart_items_storeId_idx" ON "cart_items"("storeId");
CREATE INDEX "print_jobs_tenantId_idx" ON "print_jobs"("tenantId");
CREATE INDEX "print_jobs_storeId_idx" ON "print_jobs"("storeId");
CREATE INDEX "pos_outbox_tenantId_idx" ON "pos_outbox"("tenantId");
CREATE INDEX "pos_outbox_storeId_idx" ON "pos_outbox"("storeId");
CREATE INDEX "order_pos_mappings_tenantId_idx" ON "order_pos_mappings"("tenantId");
CREATE INDEX "order_pos_mappings_storeId_idx" ON "order_pos_mappings"("storeId");

CREATE INDEX "announcements_tenantId_idx" ON "announcements"("tenantId");
CREATE INDEX "announcements_storeId_idx" ON "announcements"("storeId");
CREATE INDEX "contact_messages_tenantId_idx" ON "contact_messages"("tenantId");
CREATE INDEX "contact_messages_storeId_idx" ON "contact_messages"("storeId");
CREATE INDEX "user_roles_storeId_idx" ON "user_roles"("storeId");
