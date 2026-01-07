-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cashapp" TEXT,
ADD COLUMN     "phoneNumber" TEXT;
