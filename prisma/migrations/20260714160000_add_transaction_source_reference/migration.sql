ALTER TABLE "transactions"
  ADD COLUMN "source_transaction_id" UUID;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_source_transaction_id_fkey"
  FOREIGN KEY ("source_transaction_id")
  REFERENCES "transactions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "transactions_source_transaction_id_idx"
  ON "transactions"("source_transaction_id");
