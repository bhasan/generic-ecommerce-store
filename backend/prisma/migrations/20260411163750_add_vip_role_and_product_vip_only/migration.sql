-- AlterTable
ALTER TABLE "products" ADD COLUMN     "vipOnly" BOOLEAN NOT NULL DEFAULT false;

-- Insert VIP role
INSERT INTO roles (name, "createdAt", "updatedAt") VALUES ('VIP', NOW(), NOW()) ON CONFLICT (name) DO NOTHING;
