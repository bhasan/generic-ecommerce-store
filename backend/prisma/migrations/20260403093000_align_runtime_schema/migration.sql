DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'username'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "email" TO "username";
  END IF;
END $$;

ALTER TABLE "users" DROP COLUMN IF EXISTS "name";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "zelle" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "venmo" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "deliveryMethod" TEXT NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'EXTERNAL';

ALTER TABLE "order_items"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "thumbnail" TEXT,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cardSize" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "allowedQuantitiesOverride" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[],
  ADD COLUMN IF NOT EXISTS "quantityDiscountsOverride" JSONB;

ALTER TABLE "products"
  ALTER COLUMN "stock" TYPE DOUBLE PRECISION USING "stock"::DOUBLE PRECISION;

UPDATE "products"
SET "images" = ARRAY[]::TEXT[]
WHERE "images" IS NULL;

ALTER TABLE "products"
  ALTER COLUMN "images" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "images" SET NOT NULL;

UPDATE "reviews"
SET "votedByHelpful" = ARRAY[]::INTEGER[]
WHERE "votedByHelpful" IS NULL;

UPDATE "reviews"
SET "votedByNotHelpful" = ARRAY[]::INTEGER[]
WHERE "votedByNotHelpful" IS NULL;

ALTER TABLE "reviews"
  ALTER COLUMN "votedByHelpful" SET DEFAULT ARRAY[]::INTEGER[],
  ALTER COLUMN "votedByHelpful" SET NOT NULL,
  ALTER COLUMN "votedByNotHelpful" SET DEFAULT ARRAY[]::INTEGER[],
  ALTER COLUMN "votedByNotHelpful" SET NOT NULL;

ALTER TABLE "cart_items"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'categories'
      AND column_name = 'allowedQuantities'
      AND udt_name <> '_float8'
  ) THEN
    ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "allowedQuantities_v2" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[];

    UPDATE "categories"
    SET "allowedQuantities_v2" = CASE
      WHEN "allowedQuantities" IS NULL THEN ARRAY[]::DOUBLE PRECISION[]
      ELSE ARRAY(
        SELECT value::DOUBLE PRECISION
        FROM unnest("allowedQuantities") AS value
      )
    END;

    ALTER TABLE "categories" DROP COLUMN "allowedQuantities";
    ALTER TABLE "categories" RENAME COLUMN "allowedQuantities_v2" TO "allowedQuantities";
  END IF;
END $$;

UPDATE "categories"
SET "allowedQuantities" = ARRAY[]::DOUBLE PRECISION[]
WHERE "allowedQuantities" IS NULL;

ALTER TABLE "categories"
  ALTER COLUMN "allowedQuantities" SET DEFAULT ARRAY[]::DOUBLE PRECISION[],
  ALTER COLUMN "allowedQuantities" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "ui_settings" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ui_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ui_settings_key_key" ON "ui_settings"("key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'AnnouncementType'
  ) THEN
    CREATE TYPE "AnnouncementType" AS ENUM ('INFO', 'WARNING', 'SUCCESS');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "announcements" (
  "id" SERIAL NOT NULL,
  "message" TEXT NOT NULL,
  "type" "AnnouncementType" NOT NULL DEFAULT 'INFO',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "dismissible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ContactMessageStatus'
  ) THEN
    CREATE TYPE "ContactMessageStatus" AS ENUM ('NEW', 'READ', 'RESOLVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "contact_messages" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "userName" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "userPhone" TEXT,
  "subject" TEXT NOT NULL,
  "orderId" INTEGER,
  "message" TEXT NOT NULL,
  "status" "ContactMessageStatus" NOT NULL DEFAULT 'NEW',
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repliedAt" TIMESTAMP(3),
  "repliedBy" INTEGER,
  "repliedByName" TEXT,
  "replyMessage" TEXT,

  CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'CreditTransactionType'
  ) THEN
    CREATE TYPE "CreditTransactionType" AS ENUM ('ADDED', 'USED', 'REFUNDED', 'REMOVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "type" "CreditTransactionType" NOT NULL,
  "orderId" INTEGER,
  "note" TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);
