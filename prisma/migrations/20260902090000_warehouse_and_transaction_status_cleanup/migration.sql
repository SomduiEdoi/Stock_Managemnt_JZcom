-- Rename the persisted domain vocabulary to warehouse vocabulary.
ALTER TABLE "asset_domains" RENAME TO "asset_warehouses";
ALTER TABLE "asset_warehouses" RENAME COLUMN "domain_prefix" TO "warehouse_prefix";

ALTER TABLE "user_domain_permissions" RENAME TO "user_warehouse_permissions";
ALTER TABLE "user_warehouse_permissions" RENAME COLUMN "domain_id" TO "warehouse_id";

ALTER TABLE "asset_categories" RENAME COLUMN "domain_id" TO "warehouse_id";
ALTER TABLE "asset_models" RENAME COLUMN "domain_id" TO "warehouse_id";
ALTER TABLE "assets" RENAME COLUMN "domain_id" TO "warehouse_id";

ALTER INDEX IF EXISTS "asset_domains_code_key" RENAME TO "asset_warehouses_code_key";
ALTER INDEX IF EXISTS "asset_domains_head_stock_controller_id_idx" RENAME TO "asset_warehouses_head_stock_controller_id_idx";
ALTER INDEX IF EXISTS "user_domain_permissions_domain_id_idx" RENAME TO "user_warehouse_permissions_warehouse_id_idx";
ALTER INDEX IF EXISTS "user_domain_permissions_user_id_domain_id_key" RENAME TO "user_warehouse_permissions_user_id_warehouse_id_key";
ALTER INDEX IF EXISTS "asset_categories_domain_id_idx" RENAME TO "asset_categories_warehouse_id_idx";
ALTER INDEX IF EXISTS "asset_categories_domain_id_name_key" RENAME TO "asset_categories_warehouse_id_name_key";
ALTER INDEX IF EXISTS "asset_models_domain_id_idx" RENAME TO "asset_models_warehouse_id_idx";
ALTER INDEX IF EXISTS "assets_domain_id_idx" RENAME TO "assets_warehouse_id_idx";

-- TransactionStatus no longer stores overdue or generic active state.
ALTER TYPE "TransactionStatus" RENAME TO "TransactionStatus_old";
CREATE TYPE "TransactionStatus" AS ENUM ('BORROWED', 'RETURNED', 'USING', 'COMPLETED');

ALTER TABLE "transactions"
  ALTER COLUMN "status" TYPE "TransactionStatus"
  USING (
    CASE "status"::TEXT
      WHEN 'ACTIVE' THEN 'USING'
      WHEN 'OVERDUE' THEN 'BORROWED'
      ELSE "status"::TEXT
    END
  )::"TransactionStatus";

DROP TYPE "TransactionStatus_old";

-- Workflow status is limited to pending, rejected, in-progress, and completed.
ALTER TYPE "TransactionWorkflowStatus" RENAME TO "TransactionWorkflowStatus_old";
CREATE TYPE "TransactionWorkflowStatus" AS ENUM ('PENDING', 'REJECTED', 'IN_PROGRESS', 'COMPLETED');

ALTER TABLE "transactions"
  ALTER COLUMN "workflow_status" DROP DEFAULT,
  ALTER COLUMN "workflow_status" TYPE "TransactionWorkflowStatus"
  USING (
    CASE "workflow_status"::TEXT
      WHEN 'APPROVED' THEN 'IN_PROGRESS'
      ELSE "workflow_status"::TEXT
    END
  )::"TransactionWorkflowStatus",
  ALTER COLUMN "workflow_status" SET DEFAULT 'COMPLETED';

DROP TYPE "TransactionWorkflowStatus_old";
