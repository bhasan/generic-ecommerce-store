-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('ADDED', 'USED', 'REFUNDED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'EXTERNAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "orderId" INTEGER,
    "note" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);
