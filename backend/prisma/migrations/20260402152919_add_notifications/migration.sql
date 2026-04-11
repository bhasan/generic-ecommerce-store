-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'ORDER_CREATED',
  'ORDER_STATUS_UPDATED',
  'REGISTRATION_SUBMITTED',
  'ACCOUNT_APPROVED',
  'ACCOUNT_REJECTED',
  'CONTACT_MESSAGE_RECEIVED',
  'CONTACT_REPLY_SENT'
);

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM (
  'ORDERS',
  'AUTH',
  'CONTACT',
  'DRIVER',
  'ADMIN'
);

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM (
  'ORDER',
  'USER',
  'CONTACT_MESSAGE'
);

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'DELIVERED',
  'DISABLED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "notifications" (
  "id" SERIAL NOT NULL,
  "recipientUserId" INTEGER NOT NULL,
  "type" "NotificationType" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "sourceEntityType" "NotificationEntityType",
  "sourceEntityId" INTEGER,
  "requiresAttention" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_createdAt_idx" ON "notifications"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_readAt_idx" ON "notifications"("recipientUserId", "readAt");
