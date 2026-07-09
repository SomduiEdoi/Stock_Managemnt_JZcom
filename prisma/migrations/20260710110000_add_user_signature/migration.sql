ALTER TABLE "users"
ADD COLUMN "signature_data_url" TEXT,
ADD COLUMN "signature_uploaded_at" TIMESTAMP(3),
ADD COLUMN "signature_uploaded_by" UUID;

CREATE INDEX "users_signature_uploaded_by_idx"
ON "users"("signature_uploaded_by");

ALTER TABLE "users"
ADD CONSTRAINT "users_signature_uploaded_by_fkey"
FOREIGN KEY ("signature_uploaded_by")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
