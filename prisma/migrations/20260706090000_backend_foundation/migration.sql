-- Backend foundation for the markdown baseline:
-- organization context, domain prefix, asset type/tracking method,
-- serial/quantity tracking, projects, transaction workflow state,
-- requested quantities, and approval steps.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "AssetTrackMethod" AS ENUM ('SERIAL', 'QUANTITY');
CREATE TYPE "TransactionWorkflowStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "ProjectMemberTag" AS ENUM ('LEAD_PROJECT', 'TEAM_MEMBER');

ALTER TABLE "users"
  ADD COLUMN "organization_tag" TEXT NOT NULL DEFAULT 'STAFF';

ALTER TABLE "asset_domains"
  ADD COLUMN "domain_prefix" TEXT NOT NULL DEFAULT '';

UPDATE "asset_domains"
SET "domain_prefix" = CASE "code"::TEXT
  WHEN 'SERVER' THEN 'SV'
  WHEN 'NETWORK' THEN 'NW'
  ELSE "domain_prefix"
END
WHERE "domain_prefix" = '';

CREATE TABLE "asset_types" (
  "id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type_code" TEXT,
  "track_method" "AssetTrackMethod" NOT NULL DEFAULT 'SERIAL',
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_types_category_id_name_key" ON "asset_types"("category_id", "name");
CREATE UNIQUE INDEX "asset_types_category_id_type_code_key" ON "asset_types"("category_id", "type_code");
CREATE INDEX "asset_types_category_id_idx" ON "asset_types"("category_id");

ALTER TABLE "asset_types"
  ADD CONSTRAINT "asset_types_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_models"
  ADD COLUMN "asset_type_id" UUID;

INSERT INTO "asset_types" (
  "id",
  "category_id",
  "name",
  "type_code",
  "track_method",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "category_id",
  "type_name",
  NULL,
  'SERIAL',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "category_id", "type_name"
  FROM "asset_models"
  WHERE "category_id" IS NOT NULL
    AND "type_name" IS NOT NULL
    AND BTRIM("type_name") <> ''
) AS "legacy_types"
ON CONFLICT ("category_id", "name") DO NOTHING;

UPDATE "asset_models" AS "model"
SET "asset_type_id" = "asset_type"."id"
FROM "asset_types" AS "asset_type"
WHERE "model"."category_id" = "asset_type"."category_id"
  AND "model"."type_name" = "asset_type"."name"
  AND "model"."asset_type_id" IS NULL;

CREATE INDEX "asset_models_asset_type_id_idx" ON "asset_models"("asset_type_id");

ALTER TABLE "asset_models"
  ADD CONSTRAINT "asset_models_asset_type_id_fkey"
  FOREIGN KEY ("asset_type_id") REFERENCES "asset_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assets"
  ALTER COLUMN "serial_no" DROP NOT NULL,
  ADD COLUMN "asset_quantity" INTEGER NOT NULL DEFAULT 1;

UPDATE "assets"
SET "asset_quantity" = COALESCE(NULLIF("legacy_qty", 0), 1)
WHERE "asset_quantity" = 1;

CREATE TABLE "projects" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_status_idx" ON "projects"("status");

CREATE TABLE "project_members" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "project_tag" "ProjectMemberTag" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_members_project_id_user_id_project_tag_key"
  ON "project_members"("project_id", "user_id", "project_tag");
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transactions"
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "workflow_status" "TransactionWorkflowStatus" NOT NULL DEFAULT 'COMPLETED';

UPDATE "transactions"
SET "workflow_status" = CASE
  WHEN "status" IN ('BORROWED', 'OVERDUE', 'ACTIVE') THEN 'IN_PROGRESS'::"TransactionWorkflowStatus"
  ELSE 'COMPLETED'::"TransactionWorkflowStatus"
END;

CREATE INDEX "transactions_project_id_idx" ON "transactions"("project_id");
CREATE INDEX "transactions_workflow_status_idx" ON "transactions"("workflow_status");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transaction_items"
  ADD COLUMN "requested_quantity" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "transaction_approvals" (
  "id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "user_id" UUID,
  "approval_step_sequence" INTEGER NOT NULL,
  "approval_required_tag" TEXT NOT NULL,
  "approver_name_snapshot" TEXT,
  "approver_tag_snapshot" TEXT,
  "approval_acted_at" TIMESTAMP(3),
  "approval_comment" TEXT,
  "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "transaction_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "transaction_approvals_transaction_id_idx" ON "transaction_approvals"("transaction_id");
CREATE INDEX "transaction_approvals_user_id_idx" ON "transaction_approvals"("user_id");
CREATE INDEX "transaction_approvals_approval_status_idx" ON "transaction_approvals"("approval_status");
CREATE INDEX "transaction_approvals_approval_step_sequence_idx" ON "transaction_approvals"("approval_step_sequence");

ALTER TABLE "transaction_approvals"
  ADD CONSTRAINT "transaction_approvals_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transaction_approvals"
  ADD CONSTRAINT "transaction_approvals_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
