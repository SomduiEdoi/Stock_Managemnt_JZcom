ALTER TABLE "transaction_items"
ADD COLUMN "dispatched_at" TIMESTAMP(3),
ADD COLUMN "dispatched_by" UUID;

ALTER TABLE "transaction_items"
ADD CONSTRAINT "transaction_items_dispatched_by_fkey"
FOREIGN KEY ("dispatched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "transaction_items_dispatched_by_idx" ON "transaction_items"("dispatched_by");
