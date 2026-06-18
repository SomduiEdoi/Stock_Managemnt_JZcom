-- Add request context flags and sold pricing to transactions.
ALTER TABLE "transactions"
  ADD COLUMN "internal_request" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "service_request" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "project_request" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sold_price" DECIMAL(12,2);
