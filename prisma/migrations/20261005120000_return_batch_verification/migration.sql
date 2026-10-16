ALTER TABLE "asset_status_histories" ADD COLUMN "stock_code" TEXT;

CREATE TABLE "return_batches" (
  "id" UUID PRIMARY KEY,
  "transaction_id" UUID NOT NULL REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "request_no" TEXT NOT NULL UNIQUE,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "state" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "damage_pdf" BYTEA,
  "signed_pdf" BYTEA,
  "signed_filename" TEXT,
  "signed_by_id" UUID,
  "signed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "return_batches_transaction_id_idx" ON "return_batches"("transaction_id");

CREATE TABLE "return_outcome_checks" (
  "id" UUID PRIMARY KEY,
  "outcome_id" UUID NOT NULL REFERENCES "transaction_item_outcomes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" UUID NOT NULL,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_outcome_checks_outcome_id_user_id_key" UNIQUE ("outcome_id", "user_id")
);
