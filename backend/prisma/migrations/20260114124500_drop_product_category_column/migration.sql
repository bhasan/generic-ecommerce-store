-- Drop legacy category column from products (if it still exists)
ALTER TABLE "products" DROP COLUMN IF EXISTS "category";
