ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_stock_non_negative" CHECK (stock >= 0);
