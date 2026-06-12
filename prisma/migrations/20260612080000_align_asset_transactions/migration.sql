-- Align roles with domain ownership and staff request workflow.
CREATE TYPE "RoleCode_new" AS ENUM ('ADMIN', 'SERVER_OWNER', 'NETWORK_OWNER', 'STAFF');

ALTER TABLE "roles"
  ALTER COLUMN "code" TYPE "RoleCode_new"
  USING (
    CASE "code"::text
      WHEN 'STOCK_OWNER' THEN 'SERVER_OWNER'
      WHEN 'VIEWER' THEN 'STAFF'
      ELSE "code"::text
    END
  )::"RoleCode_new";

ALTER TYPE "RoleCode" RENAME TO "RoleCode_old";
ALTER TYPE "RoleCode_new" RENAME TO "RoleCode";
DROP TYPE "RoleCode_old";

UPDATE "roles"
SET
  "name" = 'Server Owner',
  "description" = 'Can manage Server assets and view assigned domains.'
WHERE "code" = 'SERVER_OWNER';

UPDATE "roles"
SET
  "name" = 'Staff',
  "description" = 'Can view assets and submit asset requests.'
WHERE "code" = 'STAFF';

-- Replace legacy WAIT with NEED_CHECK before recreating the enum.
CREATE TYPE "AssetStatus_new" AS ENUM (
  'READY',
  'REQUEST',
  'BORROW',
  'USING',
  'SOLD',
  'FAIL',
  'LOST',
  'NEED_CHECK'
);

ALTER TABLE "assets"
  ALTER COLUMN "status" TYPE "AssetStatus_new"
  USING (
    CASE "status"::text
      WHEN 'WAIT' THEN 'NEED_CHECK'
      ELSE "status"::text
    END
  )::"AssetStatus_new";

ALTER TABLE "asset_status_histories"
  ALTER COLUMN "from_status" TYPE "AssetStatus_new"
  USING (
    CASE
      WHEN "from_status" IS NULL THEN NULL
      WHEN "from_status"::text = 'WAIT' THEN 'NEED_CHECK'
      ELSE "from_status"::text
    END
  )::"AssetStatus_new",
  ALTER COLUMN "to_status" TYPE "AssetStatus_new"
  USING (
    CASE "to_status"::text
      WHEN 'WAIT' THEN 'NEED_CHECK'
      ELSE "to_status"::text
    END
  )::"AssetStatus_new";

ALTER TYPE "AssetStatus" RENAME TO "AssetStatus_old";
ALTER TYPE "AssetStatus_new" RENAME TO "AssetStatus";
DROP TYPE "AssetStatus_old";

-- Align history actions with request/transaction workflow.
CREATE TYPE "AssetActionType_new" AS ENUM (
  'CREATE',
  'REQUEST_HOLD',
  'REQUEST_SUBMIT',
  'STATUS_CHANGE',
  'RETURN',
  'MARK_FAIL',
  'MARK_LOST',
  'MARK_NEED_CHECK',
  'IMPORT'
);

ALTER TABLE "asset_status_histories"
  ALTER COLUMN "action_type" TYPE "AssetActionType_new"
  USING (
    CASE "action_type"::text
      WHEN 'BORROW' THEN 'STATUS_CHANGE'
      WHEN 'USE_INTERNAL' THEN 'STATUS_CHANGE'
      WHEN 'SELL' THEN 'STATUS_CHANGE'
      WHEN 'MARK_WAIT' THEN 'MARK_NEED_CHECK'
      WHEN 'STOCK_CHECK' THEN 'STATUS_CHANGE'
      ELSE "action_type"::text
    END
  )::"AssetActionType_new";

ALTER TYPE "AssetActionType" RENAME TO "AssetActionType_old";
ALTER TYPE "AssetActionType_new" RENAME TO "AssetActionType";
DROP TYPE "AssetActionType_old";

-- Microsoft 365 identity fields, while keeping password optional for the MVP fallback.
ALTER TABLE "users"
  ADD COLUMN "azure_ad_object_id" TEXT,
  ADD COLUMN "position" TEXT,
  ADD COLUMN "last_login_at" TIMESTAMP(3),
  ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE UNIQUE INDEX "users_azure_ad_object_id_key" ON "users"("azure_ad_object_id");

-- Request lock metadata on assets.
ALTER TABLE "assets"
  ADD COLUMN "request_locked_by" UUID,
  ADD COLUMN "request_locked_at" TIMESTAMP(3);

CREATE INDEX "assets_request_locked_by_idx" ON "assets"("request_locked_by");

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_request_locked_by_fkey"
  FOREIGN KEY ("request_locked_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Transaction workflow.
CREATE TYPE "TransactionType" AS ENUM ('BORROW', 'USING', 'SOLD');
CREATE TYPE "TransactionStatus" AS ENUM ('BORROWED', 'RETURNED', 'OVERDUE', 'ACTIVE', 'COMPLETED');

CREATE TABLE "transactions" (
  "id" UUID NOT NULL,
  "transaction_no" TEXT,
  "type" "TransactionType" NOT NULL,
  "status" "TransactionStatus" NOT NULL,
  "purpose" TEXT NOT NULL,
  "note" TEXT,
  "document_ref" TEXT,
  "due_date" TIMESTAMP(3),
  "requested_by" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "returned_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transaction_items" (
  "id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "from_status" "AssetStatus",
  "to_status" "AssetStatus" NOT NULL,
  "note" TEXT,
  "returned_at" TIMESTAMP(3),
  "returned_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "asset_status_histories"
  ADD COLUMN "transaction_id" UUID;

CREATE UNIQUE INDEX "transactions_transaction_no_key" ON "transactions"("transaction_no");
CREATE INDEX "transactions_type_idx" ON "transactions"("type");
CREATE INDEX "transactions_status_idx" ON "transactions"("status");
CREATE INDEX "transactions_requested_by_idx" ON "transactions"("requested_by");
CREATE INDEX "transactions_created_by_idx" ON "transactions"("created_by");
CREATE INDEX "transactions_due_date_idx" ON "transactions"("due_date");
CREATE INDEX "transaction_items_asset_id_idx" ON "transaction_items"("asset_id");
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items"("transaction_id");
CREATE INDEX "transaction_items_returned_by_idx" ON "transaction_items"("returned_by");
CREATE UNIQUE INDEX "transaction_items_transaction_id_asset_id_key" ON "transaction_items"("transaction_id", "asset_id");
CREATE INDEX "asset_status_histories_transaction_id_idx" ON "asset_status_histories"("transaction_id");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transaction_items"
  ADD CONSTRAINT "transaction_items_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transaction_items"
  ADD CONSTRAINT "transaction_items_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transaction_items"
  ADD CONSTRAINT "transaction_items_returned_by_fkey"
  FOREIGN KEY ("returned_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_status_histories"
  ADD CONSTRAINT "asset_status_histories_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
