-- Phase 1: introduce the hybrid inventory shape without rewriting existing
-- transaction or approval logic. Legacy tracking columns remain temporarily
-- so the application can be migrated in a separate phase.

CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'USED');

ALTER TABLE "asset_models"
  ADD COLUMN "is_serialized" BOOLEAN NOT NULL DEFAULT true;

UPDATE "asset_models"
SET "is_serialized" = CASE
  WHEN "track_method" = 'QUANTITY'::"AssetTrackMethod" THEN false
  ELSE true
END;

ALTER TABLE "assets"
  ADD COLUMN "condition" "AssetCondition" NOT NULL DEFAULT 'NEW';

ALTER TABLE "asset_status_histories"
  ADD COLUMN "quantity_before" INTEGER,
  ADD COLUMN "quantity_after" INTEGER,
  ADD COLUMN "quantity_changed" INTEGER,
  ADD COLUMN "condition" "AssetCondition" NOT NULL DEFAULT 'NEW';

ALTER TABLE "transaction_items"
  ADD COLUMN "asset_model_id" UUID;

UPDATE "transaction_items" AS item
SET "asset_model_id" = asset."asset_model_id"
FROM "assets" AS asset
WHERE asset."id" = item."asset_id";

ALTER TABLE "transaction_items"
  ALTER COLUMN "asset_id" DROP NOT NULL;

ALTER TABLE "transaction_item_outcomes"
  ADD COLUMN "asset_id" UUID,
  ADD COLUMN "return_condition" "AssetCondition";

ALTER TABLE "transaction_items"
  ADD CONSTRAINT "transaction_items_asset_model_id_fkey"
  FOREIGN KEY ("asset_model_id") REFERENCES "asset_models"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transaction_item_outcomes"
  ADD CONSTRAINT "transaction_item_outcomes_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "transaction_items_asset_model_id_idx"
  ON "transaction_items"("asset_model_id");

CREATE INDEX "transaction_item_outcomes_asset_id_idx"
  ON "transaction_item_outcomes"("asset_id");

CREATE INDEX "assets_asset_model_id_warehouse_id_condition_idx"
  ON "assets"("asset_model_id", "warehouse_id", "condition");

CREATE INDEX "asset_status_histories_condition_changed_at_idx"
  ON "asset_status_histories"("condition", "changed_at");
