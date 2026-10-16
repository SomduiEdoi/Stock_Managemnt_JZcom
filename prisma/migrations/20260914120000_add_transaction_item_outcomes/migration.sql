CREATE TABLE "transaction_item_outcomes" (
  "id" UUID NOT NULL,
  "transaction_item_id" UUID NOT NULL,
  "outcome_status" "AssetStatus" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "sold_transaction_id" UUID,
  "approved_at" TIMESTAMP(3),
  "approved_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transaction_item_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "transaction_item_outcomes_transaction_item_id_idx" ON "transaction_item_outcomes"("transaction_item_id");
CREATE INDEX "transaction_item_outcomes_sold_transaction_id_idx" ON "transaction_item_outcomes"("sold_transaction_id");
CREATE INDEX "transaction_item_outcomes_outcome_status_idx" ON "transaction_item_outcomes"("outcome_status");

ALTER TABLE "transaction_item_outcomes"
  ADD CONSTRAINT "transaction_item_outcomes_transaction_item_id_fkey"
  FOREIGN KEY ("transaction_item_id") REFERENCES "transaction_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transaction_item_outcomes"
  ADD CONSTRAINT "transaction_item_outcomes_sold_transaction_id_fkey"
  FOREIGN KEY ("sold_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transaction_item_outcomes"
  ADD CONSTRAINT "transaction_item_outcomes_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
