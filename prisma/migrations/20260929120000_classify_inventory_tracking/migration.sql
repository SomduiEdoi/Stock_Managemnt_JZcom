-- Classify inventory models from the actual stock records in the requested
-- warehouses. A model is serialized when at least one scoped asset has a
-- meaningful serial number; otherwise it is a quantity pool.
WITH scoped_models AS (
  SELECT
    asset.asset_model_id,
    bool_or(
      NULLIF(btrim(asset.serial_no), '') IS NOT NULL
      AND btrim(asset.serial_no) <> '-'
    ) AS has_serial
  FROM "assets" AS asset
  INNER JOIN "asset_warehouses" AS warehouse
    ON warehouse.id = asset.warehouse_id
  WHERE warehouse.code IN ('INSTALLATION', 'SALE_STOCK', 'NETWORK')
  GROUP BY asset.asset_model_id
)
UPDATE "asset_models" AS model
SET
  "is_serialized" = scoped.has_serial,
  "track_method" = CASE
    WHEN scoped.has_serial THEN 'SERIAL'::"AssetTrackMethod"
    ELSE 'QUANTITY'::"AssetTrackMethod"
  END
FROM scoped_models AS scoped
WHERE model.id = scoped.asset_model_id;

-- Keep legacy asset-level tracking values aligned while older code is being
-- retired in favor of AssetModel.isSerialized.
UPDATE "assets" AS asset
SET "track_method" = model."track_method"
FROM "asset_models" AS model, "asset_warehouses" AS warehouse
WHERE asset.asset_model_id = model.id
  AND warehouse.id = asset.warehouse_id
  AND warehouse.code IN ('INSTALLATION', 'SALE_STOCK', 'NETWORK');
