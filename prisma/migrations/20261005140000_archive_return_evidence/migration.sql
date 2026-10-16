CREATE TABLE "return_batch_evidence" (
  "id" UUID PRIMARY KEY,
  "batch_id" UUID NOT NULL REFERENCES "return_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL,
  "damage_pdf" BYTEA,
  "signed_pdf" BYTEA,
  "signed_filename" TEXT,
  "signed_by_id" UUID,
  "signed_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_batch_evidence_batch_id_revision_key" UNIQUE ("batch_id", "revision")
);
