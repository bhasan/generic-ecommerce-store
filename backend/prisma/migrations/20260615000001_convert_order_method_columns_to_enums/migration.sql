-- Pre-check (run manually before applying): SELECT DISTINCT "deliveryMethod", "paymentMethod" FROM "orders";
-- All values must be members of the enums below before this migration runs.

-- CreateEnum
CREATE TYPE "DeliveryMethodEnum" AS ENUM ('DELIVERY', 'PICKUP', 'CURBSIDE');
CREATE TYPE "PaymentMethodEnum"  AS ENUM ('EXTERNAL', 'CREDIT', 'IN_STORE', 'CC');

-- AlterTable: deliveryMethod String -> DeliveryMethodEnum
ALTER TABLE "orders"
  ALTER COLUMN "deliveryMethod" DROP DEFAULT,
  ALTER COLUMN "deliveryMethod" TYPE "DeliveryMethodEnum"
    USING "deliveryMethod"::"DeliveryMethodEnum",
  ALTER COLUMN "deliveryMethod" SET DEFAULT 'DELIVERY';

-- AlterTable: paymentMethod String -> PaymentMethodEnum
ALTER TABLE "orders"
  ALTER COLUMN "paymentMethod" DROP DEFAULT,
  ALTER COLUMN "paymentMethod" TYPE "PaymentMethodEnum"
    USING "paymentMethod"::"PaymentMethodEnum",
  ALTER COLUMN "paymentMethod" SET DEFAULT 'EXTERNAL';
