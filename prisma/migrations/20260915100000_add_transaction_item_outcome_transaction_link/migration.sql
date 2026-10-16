ALTER TABLE "transaction_item_outcomes"
  ADD COLUMN IF NOT EXISTS "transaction_id" UUID;

UPDATE "transaction_item_outcomes" AS outcome
SET "transaction_id" = item."transaction_id"
FROM "transaction_items" AS item
WHERE outcome."transaction_item_id" = item."id"
  AND outcome."transaction_id" IS NULL;

CREATE INDEX IF NOT EXISTS "transaction_item_outcomes_transaction_id_idx"
  ON "transaction_item_outcomes"("transaction_id");

DO $$
BEGIN
  ALTER TABLE "transaction_item_outcomes"
    ADD CONSTRAINT "transaction_item_outcomes_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
