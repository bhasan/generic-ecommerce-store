-- Add missing foreign key indexes for better query performance
-- store_credit_transactions: querying by orderId
-- contact_messages: querying by orderId

CREATE INDEX "store_credit_transactions_orderId_idx" ON "store_credit_transactions"("orderId");
CREATE INDEX "contact_messages_orderId_idx" ON "contact_messages"("orderId");
