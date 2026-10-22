CREATE TABLE "destructive_confirmations" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "destructive_confirmations_expires_at_idx" ON "destructive_confirmations"("expires_at");
