-- Add ProductItem sortOrder and cardSize columns
ALTER TABLE "products" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "cardSize" TEXT NOT NULL DEFAULT 'standard';
