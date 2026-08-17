-- 1. Add denormalized category name column (needed because GENERATED columns can't reference other tables)
ALTER TABLE "products"
  ADD COLUMN "search_category_name" TEXT;

-- 2. Backfill from categories
UPDATE "products" p
SET "search_category_name" = c."name"
FROM "categories" c
WHERE c."id" = p."categoryId";

-- 3. Add generated tsvector column (stored, auto-maintained by Postgres)
ALTER TABLE "products"
  ADD COLUMN "search_vector" TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("search_category_name", '')), 'C')
  ) STORED;

-- 4. GIN index for fast @@ lookups
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");

-- 5. Trigger function: propagate category name changes to products
CREATE OR REPLACE FUNCTION sync_product_search_category_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."name" IS DISTINCT FROM NEW."name" THEN
    UPDATE "products"
    SET "search_category_name" = NEW."name"
    WHERE "categoryId" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Attach trigger to categories
CREATE TRIGGER trg_sync_product_search_category_name
AFTER UPDATE ON "categories"
FOR EACH ROW EXECUTE FUNCTION sync_product_search_category_name();
