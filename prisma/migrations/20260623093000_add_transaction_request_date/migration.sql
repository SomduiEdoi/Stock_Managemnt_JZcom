-- Store the business request date separately from system-created timestamp.
ALTER TABLE "transactions"
  ADD COLUMN "request_date" TIMESTAMP(3);

UPDATE "transactions"
  SET "request_date" = "created_at"
  WHERE "request_date" IS NULL;

ALTER TABLE "transactions"
  ALTER COLUMN "request_date" SET NOT NULL,
  ALTER COLUMN "request_date" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "transactions_request_date_idx"
  ON "transactions"("request_date");
