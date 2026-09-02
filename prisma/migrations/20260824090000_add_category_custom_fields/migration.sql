CREATE TYPE "CustomFieldDataType" AS ENUM ('TEXT', 'NUMBER', 'DROPDOWN', 'BOOLEAN');

CREATE TABLE "asset_category_custom_fields" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "category_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "data_type" "CustomFieldDataType" NOT NULL DEFAULT 'TEXT',
  "unit" TEXT,
  "placeholder" TEXT,
  "options" JSONB,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "is_searchable" BOOLEAN NOT NULL DEFAULT false,
  "is_filterable" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_category_custom_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_custom_field_values" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "asset_id" UUID NOT NULL,
  "field_id" UUID NOT NULL,
  "value_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_category_custom_fields_category_id_key_key" ON "asset_category_custom_fields"("category_id", "key");
CREATE INDEX "asset_category_custom_fields_category_id_idx" ON "asset_category_custom_fields"("category_id");
CREATE UNIQUE INDEX "asset_custom_field_values_asset_id_field_id_key" ON "asset_custom_field_values"("asset_id", "field_id");
CREATE INDEX "asset_custom_field_values_field_id_idx" ON "asset_custom_field_values"("field_id");

ALTER TABLE "asset_category_custom_fields"
  ADD CONSTRAINT "asset_category_custom_fields_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_custom_field_values"
  ADD CONSTRAINT "asset_custom_field_values_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_custom_field_values"
  ADD CONSTRAINT "asset_custom_field_values_field_id_fkey"
  FOREIGN KEY ("field_id") REFERENCES "asset_category_custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "asset_category_custom_fields" ("category_id", "key", "label", "data_type", "placeholder", "is_searchable", "is_filterable", "sort_order")
SELECT c."id", f."key", f."label", f."data_type"::"CustomFieldDataType", f."placeholder", true, true, f."sort_order"
FROM "asset_categories" c
JOIN "asset_domains" d ON d."id" = c."domain_id"
JOIN (VALUES
  ('SERVER', 'Server', 'generation', 'Generation', 'TEXT', 'e.g. Gen10', 1),
  ('SERVER', 'Server', 'cpu', 'CPU', 'TEXT', 'e.g. Intel Xeon', 2),
  ('SERVER', 'Server', 'ram', 'RAM', 'TEXT', 'e.g. 128 GB', 3),
  ('SERVER', 'Server', 'storage', 'Storage', 'TEXT', 'e.g. 2 TB SSD', 4),
  ('NETWORK', 'Switch', 'ports', 'Ports', 'NUMBER', 'e.g. 24', 1),
  ('NETWORK', 'Switch', 'port_speed', 'Port Speed', 'TEXT', 'e.g. 1Gbps', 2),
  ('NETWORK', 'Switch', 'uplink', 'Uplink', 'TEXT', 'e.g. 2x SFP', 3),
  ('NETWORK', 'Switch', 'layer', 'Layer', 'TEXT', 'e.g. L2', 4),
  ('NETWORK', 'Cable', 'length', 'Length', 'TEXT', 'e.g. 50 CM', 1),
  ('NETWORK', 'Cable', 'connector', 'Connector', 'TEXT', 'e.g. SFP+ to SFP+', 2),
  ('NETWORK', 'Cable', 'speed_standard', 'Speed / Standard', 'TEXT', 'e.g. 10GbE', 3)
) AS f("domain_code", "category_name", "key", "label", "data_type", "placeholder", "sort_order")
  ON d."code" = f."domain_code" AND c."name" = f."category_name"
ON CONFLICT ("category_id", "key") DO NOTHING;
