DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'DeliveryZoneStatus'
  ) THEN
    CREATE TYPE "DeliveryZoneStatus" AS ENUM ('IN_ZONE', 'OUT_OF_ZONE', 'UNVERIFIED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'DeliveryEligibilitySource'
  ) THEN
    CREATE TYPE "DeliveryEligibilitySource" AS ENUM ('GOOGLE_GEOCODING', 'ADDRESS_CACHE', 'ZIP_FALLBACK', 'NONE');
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deliveryZoneStatus" "DeliveryZoneStatus",
  ADD COLUMN IF NOT EXISTS "deliveryZoneSource" "DeliveryEligibilitySource",
  ADD COLUMN IF NOT EXISTS "deliveryZoneDistanceMiles" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "deliveryZoneCheckedAt" TIMESTAMP(3);

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryZoneStatus" "DeliveryZoneStatus",
  ADD COLUMN IF NOT EXISTS "deliveryEligibilitySource" "DeliveryEligibilitySource",
  ADD COLUMN IF NOT EXISTS "deliveryDistanceMiles" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "deliveryThresholdMiles" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "deliveryZoneCheckedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "address_geocode_cache" (
  "id" SERIAL NOT NULL,
  "normalizedAddress" TEXT NOT NULL,
  "formattedAddress" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "city" TEXT,
  "state" TEXT,
  "zipCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "address_geocode_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "address_geocode_cache_normalizedAddress_key"
  ON "address_geocode_cache"("normalizedAddress");
