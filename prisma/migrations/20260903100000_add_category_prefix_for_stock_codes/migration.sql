ALTER TABLE "asset_categories"
  ADD COLUMN "category_code" TEXT;

CREATE UNIQUE INDEX "asset_categories_warehouse_id_category_code_key"
  ON "asset_categories"("warehouse_id", "category_code");
