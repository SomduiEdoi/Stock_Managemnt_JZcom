ALTER TABLE "asset_domains"
  ADD COLUMN IF NOT EXISTS "head_stock_controller_id" UUID;

CREATE INDEX IF NOT EXISTS "asset_domains_head_stock_controller_id_idx"
  ON "asset_domains"("head_stock_controller_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asset_domains_head_stock_controller_id_fkey'
  ) THEN
    ALTER TABLE "asset_domains"
      ADD CONSTRAINT "asset_domains_head_stock_controller_id_fkey"
      FOREIGN KEY ("head_stock_controller_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "project_id" TEXT,
  ADD COLUMN IF NOT EXISTS "lead_user_id" UUID;

UPDATE "projects"
SET "project_id" = 'PRJ-' || SUBSTRING("id"::TEXT, 1, 8)
WHERE "project_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_id_key'
  ) THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_project_id_key" UNIQUE ("project_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_lead_user_id_fkey'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_lead_user_id_fkey"
      FOREIGN KEY ("lead_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "projects_lead_user_id_idx" ON "projects"("lead_user_id");
