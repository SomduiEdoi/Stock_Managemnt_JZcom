BEGIN;

-- Abort rather than rewrite duplicate warehouse prefixes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "asset_warehouses"
    GROUP BY "warehouse_prefix" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate warehouse prefixes; review data before adding the unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX "asset_warehouses_warehouse_prefix_key"
  ON "asset_warehouses"("warehouse_prefix");
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

COMMIT;
