ALTER TABLE "asset_models"
  ADD COLUMN "track_method" "AssetTrackMethod" NOT NULL DEFAULT 'SERIAL';

UPDATE "asset_models" AS model
SET "track_method" = COALESCE(
  (SELECT type."track_method"
   FROM "asset_types" AS type
   WHERE type."id" = model."asset_type_id"),
  'SERIAL'::"AssetTrackMethod"
);

ALTER TABLE "assets"
  ADD COLUMN "track_method" "AssetTrackMethod";

ALTER TABLE "asset_types"
  DROP COLUMN "track_method";
