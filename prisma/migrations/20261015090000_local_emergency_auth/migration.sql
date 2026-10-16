ALTER TABLE "users" ADD COLUMN "local_username" TEXT;
CREATE UNIQUE INDEX "users_local_username_key" ON "users"("local_username");
CREATE TABLE "login_throttles" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "reset_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "login_audits" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID,
  "mode" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "login_audits_created_at_idx" ON "login_audits"("created_at");
