-- Track the final outcome for each item in a submitted request.
ALTER TABLE "transaction_items"
  ADD COLUMN "resolved_status" "AssetStatus",
  ADD COLUMN "resolution_note" TEXT;

CREATE INDEX "transaction_items_resolved_status_idx"
  ON "transaction_items"("resolved_status");
