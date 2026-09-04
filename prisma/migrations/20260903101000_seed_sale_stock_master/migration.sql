INSERT INTO "asset_warehouses" (
  "id",
  "code",
  "warehouse_prefix",
  "name",
  "inventory_family",
  "description",
  "is_active",
  "created_at",
  "updated_at"
)
VALUES (
  '11111111-530c-4000-9000-000000000001',
  'SALE_STOCK',
  'SS',
  'Sale Stock',
  'QUANTITY',
  'Sale stock warehouse for BSD hardware.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "inventory_family" = EXCLUDED."inventory_family",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

WITH sale_stock AS (
  SELECT "id" AS "warehouse_id"
  FROM "asset_warehouses"
  WHERE "code" = 'SALE_STOCK'
)
INSERT INTO "asset_categories" (
  "id",
  "warehouse_id",
  "name",
  "category_code",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT category_data."id"::uuid, sale_stock."warehouse_id", category_data."name", category_data."code", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM sale_stock
CROSS JOIN (
  VALUES
    ('11111111-530c-4000-9000-000000000101', 'Power', 'PW'),
    ('11111111-530c-4000-9000-000000000102', 'Storage', 'ST'),
    ('11111111-530c-4000-9000-000000000103', 'Memory', 'MM'),
    ('11111111-530c-4000-9000-000000000104', 'Computer', 'CP'),
    ('11111111-530c-4000-9000-000000000105', 'Cables', 'CB'),
    ('11111111-530c-4000-9000-000000000106', 'Adapter & Converter', 'AD'),
    ('11111111-530c-4000-9000-000000000107', 'Accessories', 'AC')
) AS category_data("id", "name", "code")
ON CONFLICT ("warehouse_id", "name") DO UPDATE SET
  "category_code" = EXCLUDED."category_code",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

WITH category_lookup AS (
  SELECT c."id", c."name"
  FROM "asset_categories" c
  JOIN "asset_warehouses" w ON w."id" = c."warehouse_id"
  WHERE w."code" = 'SALE_STOCK'
)
INSERT INTO "asset_types" (
  "id",
  "category_id",
  "name",
  "type_code",
  "track_method",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT type_data."id"::uuid, category_lookup."id", type_data."name", type_data."code", 'QUANTITY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM category_lookup
JOIN (
  VALUES
    ('11111111-530c-4000-9000-000000000201', 'Power', 'UPS', 'UPS'),
    ('11111111-530c-4000-9000-000000000202', 'Power', 'Battery', 'BAT'),
    ('11111111-530c-4000-9000-000000000203', 'Storage', 'HDD', 'HDD'),
    ('11111111-530c-4000-9000-000000000204', 'Storage', 'SSD', 'SSD'),
    ('11111111-530c-4000-9000-000000000205', 'Storage', 'USB Flash Drive', 'UFD'),
    ('11111111-530c-4000-9000-000000000206', 'Storage', 'Memory Card', 'MCD'),
    ('11111111-530c-4000-9000-000000000207', 'Memory', 'RAM', 'RAM'),
    ('11111111-530c-4000-9000-000000000208', 'Computer', 'Notebook', 'NBK'),
    ('11111111-530c-4000-9000-000000000209', 'Computer', 'Mini PC', 'MPC'),
    ('11111111-530c-4000-9000-000000000210', 'Computer', 'PC/Desktop', 'PCD'),
    ('11111111-530c-4000-9000-000000000211', 'Computer', 'Monitor', 'MON'),
    ('11111111-530c-4000-9000-000000000212', 'Computer', 'Component', 'CPN'),
    ('11111111-530c-4000-9000-000000000213', 'Cables', 'HDMI', 'HDM'),
    ('11111111-530c-4000-9000-000000000214', 'Cables', 'USB Cable', 'USB'),
    ('11111111-530c-4000-9000-000000000215', 'Cables', 'VGA Cable', 'VGA'),
    ('11111111-530c-4000-9000-000000000216', 'Cables', 'Printer Cable', 'PRT'),
    ('11111111-530c-4000-9000-000000000217', 'Adapter & Converter', 'Converter', 'ADP'),
    ('11111111-530c-4000-9000-000000000218', 'Accessories', 'Mouse pad', 'MPD'),
    ('11111111-530c-4000-9000-000000000219', 'Accessories', 'Bag', 'BAG'),
    ('11111111-530c-4000-9000-000000000220', 'Accessories', 'Mouse', 'MOU'),
    ('11111111-530c-4000-9000-000000000221', 'Accessories', 'Headphones', 'HPN'),
    ('11111111-530c-4000-9000-000000000222', 'Accessories', 'Keypad', 'KPD'),
    ('11111111-530c-4000-9000-000000000223', 'Accessories', 'Enclosure', 'ENC'),
    ('11111111-530c-4000-9000-000000000224', 'Accessories', 'Office Accessory', 'OFA'),
    ('11111111-530c-4000-9000-000000000225', 'Accessories', 'Switch', 'SWT')
) AS type_data("id", "category", "name", "code") ON type_data."category" = category_lookup."name"
ON CONFLICT ("category_id", "name") DO UPDATE SET
  "type_code" = EXCLUDED."type_code",
  "track_method" = 'QUANTITY',
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "user_warehouse_permissions" (
  "id",
  "user_id",
  "warehouse_id",
  "can_view",
  "can_manage",
  "created_at",
  "updated_at"
)
SELECT gen_random_uuid(), u."id", w."id", true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN "asset_warehouses" w
WHERE w."code" = 'SALE_STOCK'
  AND u."is_active" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "user_warehouse_permissions" p
    WHERE p."user_id" = u."id"
      AND p."warehouse_id" = w."id"
  );

UPDATE "user_warehouse_permissions" p
SET "can_manage" = true,
    "can_view" = true,
    "updated_at" = CURRENT_TIMESTAMP
FROM "users" u, "asset_warehouses" w
WHERE p."user_id" = u."id"
  AND p."warehouse_id" = w."id"
  AND w."code" = 'SALE_STOCK'
  AND lower(u."name") = 'joy'
  AND u."is_active" = true;
