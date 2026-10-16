ALTER TABLE "transaction_item_outcomes"
  ADD COLUMN "resolution_batch_id" UUID;

ALTER TABLE "transaction_approvals"
  ADD COLUMN "resolution_batch_id" UUID;

CREATE INDEX "transaction_item_outcomes_resolution_batch_id_idx"
  ON "transaction_item_outcomes"("resolution_batch_id");

CREATE INDEX "transaction_approvals_resolution_batch_id_idx"
  ON "transaction_approvals"("resolution_batch_id");
