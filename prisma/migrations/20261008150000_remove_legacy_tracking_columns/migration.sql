ALTER TABLE "asset_warehouses" DROP COLUMN "inventory_family";
ALTER TABLE "asset_models" DROP COLUMN "track_method";
ALTER TABLE "assets" DROP COLUMN "track_method", DROP COLUMN "legacy_qty", DROP COLUMN "legacy_fg";
DROP TYPE "AssetTrackMethod";
