-- Add deliveryMethod column to orders
ALTER TABLE "orders" ADD COLUMN "deliveryMethod" TEXT NOT NULL DEFAULT 'DELIVERY';
