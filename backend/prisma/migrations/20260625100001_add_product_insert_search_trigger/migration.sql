CREATE OR REPLACE FUNCTION sync_product_search_category_name_on_product()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT c."name" INTO NEW."search_category_name"
  FROM "categories" c WHERE c."id" = NEW."categoryId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_product_search_category_name_on_product
BEFORE INSERT OR UPDATE OF "categoryId" ON "products"
FOR EACH ROW EXECUTE FUNCTION sync_product_search_category_name_on_product();
