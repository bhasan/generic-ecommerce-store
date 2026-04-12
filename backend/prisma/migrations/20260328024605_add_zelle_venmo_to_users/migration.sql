-- AlterTable
ALTER TABLE "users" ADD COLUMN     "venmo" TEXT,
ADD COLUMN     "zelle" TEXT;

-- RenameIndex
ALTER INDEX "users_email_key" RENAME TO "users_username_key";
