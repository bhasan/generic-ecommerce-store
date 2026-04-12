-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_parentId_key" ON "categories"("name", "parentId");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add nullable categoryId to products for backfill
ALTER TABLE "products" ADD COLUMN "categoryId" INTEGER;

-- Backfill categories from existing product.category values
INSERT INTO "categories" ("name", "description", "parentId", "sortOrder", "createdAt", "updatedAt")
SELECT DISTINCT "category", NULL::text, NULL::integer, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products"
WHERE "category" IS NOT NULL;

UPDATE "products" AS p
SET "categoryId" = c."id"
FROM "categories" AS c
WHERE p."category" = c."name" AND c."parentId" IS NULL;

-- Enforce categoryId presence and foreign key
ALTER TABLE "products" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop legacy category column
ALTER TABLE "products" DROP COLUMN "category";
