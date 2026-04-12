-- CreateEnum
CREATE TYPE "DeliveryZoneStatus" AS ENUM ('IN_ZONE', 'OUT_OF_ZONE', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "DeliveryEligibilitySource" AS ENUM ('GOOGLE_GEOCODING', 'ADDRESS_CACHE', 'ZIP_FALLBACK', 'NONE');

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "deliveryZoneStatus" "DeliveryZoneStatus";
ALTER TABLE "users" ADD COLUMN "deliveryZoneSource" "DeliveryEligibilitySource";
ALTER TABLE "users" ADD COLUMN "deliveryZoneDistanceMiles" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "deliveryZoneCheckedAt" TIMESTAMP(3);

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN "deliveryZoneStatus" "DeliveryZoneStatus";
ALTER TABLE "orders" ADD COLUMN "deliveryEligibilitySource" "DeliveryEligibilitySource";
ALTER TABLE "orders" ADD COLUMN "deliveryDistanceMiles" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "deliveryThresholdMiles" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "deliveryZoneCheckedAt" TIMESTAMP(3);
