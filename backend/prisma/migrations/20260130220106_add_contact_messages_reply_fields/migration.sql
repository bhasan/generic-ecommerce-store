-- AlterTable
ALTER TABLE "contact_messages" ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "repliedBy" INTEGER,
ADD COLUMN     "repliedByName" TEXT,
ADD COLUMN     "replyMessage" TEXT;
