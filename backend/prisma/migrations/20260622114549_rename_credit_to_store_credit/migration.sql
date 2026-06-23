-- Rename credit_transactions table to store_credit_transactions
ALTER TABLE "credit_transactions" RENAME TO "store_credit_transactions";

-- Rename creditBalance column to storeCreditBalance on users table
ALTER TABLE "users" RENAME COLUMN "creditBalance" TO "storeCreditBalance";

-- Rename the CreditTransactionType enum to StoreCreditTransactionType
ALTER TYPE "CreditTransactionType" RENAME TO "StoreCreditTransactionType";

-- Rename the CREDIT value in PaymentMethodEnum to STORE_CREDIT
ALTER TYPE "PaymentMethodEnum" RENAME VALUE 'CREDIT' TO 'STORE_CREDIT';
