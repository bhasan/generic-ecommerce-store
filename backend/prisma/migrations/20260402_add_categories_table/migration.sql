-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allowedQuantities" DECIMAL(65,30)[],
    "quantityDiscounts" JSONB,
    CONSTRAINT "categories_name_parentId_key" UNIQUE("name", "parentId")
);

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename category column to categoryId and convert to integer
ALTER TABLE "products" ADD COLUMN "categoryId" INTEGER;

-- Insert default category
INSERT INTO "categories" ("name", "description", "updatedAt") VALUES ('Uncategorized', 'Default category', CURRENT_TIMESTAMP);

-- Update products to use the default category ID
UPDATE "products" SET "categoryId" = (SELECT "id" FROM "categories" WHERE "name" = 'Uncategorized' LIMIT 1);

-- Make categoryId NOT NULL
ALTER TABLE "products" ALTER COLUMN "categoryId" SET NOT NULL;

-- Drop old category column
ALTER TABLE "products" DROP COLUMN "category";

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
