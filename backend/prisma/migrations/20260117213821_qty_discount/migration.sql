-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "quantityDiscounts" JSONB;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "quantityDiscountsOverride" JSONB;
