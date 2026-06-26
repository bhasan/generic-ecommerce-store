-- CreateTable
CREATE TABLE "pos_outbox" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_pos_mappings" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_pos_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_outbox_status_id_idx" ON "pos_outbox"("status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "order_pos_mappings_orderId_provider_key" ON "order_pos_mappings"("orderId", "provider");

-- AddForeignKey
ALTER TABLE "pos_outbox" ADD CONSTRAINT "pos_outbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_pos_mappings" ADD CONSTRAINT "order_pos_mappings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
