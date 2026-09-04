ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "specifications" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "asset_category_custom_fields"
  ADD COLUMN IF NOT EXISTS "asset_type_id" UUID;

ALTER TABLE "asset_custom_field_values"
  ADD COLUMN IF NOT EXISTS "value_number" DECIMAL(18, 6),
  ADD COLUMN IF NOT EXISTS "value_boolean" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "value_json" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asset_category_custom_fields_asset_type_id_fkey'
  ) THEN
    ALTER TABLE "asset_category_custom_fields"
      ADD CONSTRAINT "asset_category_custom_fields_asset_type_id_fkey"
      FOREIGN KEY ("asset_type_id") REFERENCES "asset_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "asset_category_custom_fields_asset_type_id_idx"
  ON "asset_category_custom_fields"("asset_type_id");

CREATE INDEX IF NOT EXISTS "assets_specifications_gin_idx"
  ON "assets" USING GIN ("specifications");
