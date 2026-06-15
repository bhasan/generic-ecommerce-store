-- AlterTable: add structured curbside and payment-handle columns (all nullable, zero risk)
ALTER TABLE "orders" ADD COLUMN "vehicleDescription" TEXT;
ALTER TABLE "orders" ADD COLUMN "parkingSpot" TEXT;
ALTER TABLE "orders" ADD COLUMN "paymentHandle" TEXT;

-- Backfill legacy CURBSIDE rows: deliveryAddress = "CURBSIDE: <vehicle>" or "CURBSIDE: <vehicle> | SPOT: <spot>"
UPDATE "orders"
SET
  "vehicleDescription" = NULLIF(TRIM(REGEXP_REPLACE(
    SPLIT_PART("deliveryAddress", ' | SPOT:', 1),
    '^\s*CURBSIDE:\s*', '', 'i'
  )), ''),
  "parkingSpot" = NULLIF(TRIM(SPLIT_PART("deliveryAddress", ' | SPOT:', 2)), '')
WHERE "deliveryMethod" = 'CURBSIDE'
  AND "deliveryAddress" IS NOT NULL;
