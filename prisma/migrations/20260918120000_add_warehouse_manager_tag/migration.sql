ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'WAREHOUSE_MANAGER';

CREATE TABLE "warehouse_manager_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "warehouse_manager_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "warehouse_manager_assignments_user_id_warehouse_id_key"
  ON "warehouse_manager_assignments"("user_id", "warehouse_id");
CREATE INDEX "warehouse_manager_assignments_warehouse_id_idx"
  ON "warehouse_manager_assignments"("warehouse_id");
CREATE INDEX "warehouse_manager_assignments_user_id_idx"
  ON "warehouse_manager_assignments"("user_id");

ALTER TABLE "warehouse_manager_assignments"
  ADD CONSTRAINT "warehouse_manager_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_manager_assignments"
  ADD CONSTRAINT "warehouse_manager_assignments_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "asset_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "warehouse_manager_assignments" ("id", "user_id", "warehouse_id", "created_at", "updated_at")
SELECT gen_random_uuid(), "head_stock_controller_id", "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "asset_warehouses"
WHERE "head_stock_controller_id" IS NOT NULL;
