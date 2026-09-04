INSERT INTO "user_warehouse_permissions" (
  "id",
  "user_id",
  "warehouse_id",
  "can_view",
  "can_manage",
  "created_at",
  "updated_at"
)
SELECT gen_random_uuid(), u."id", w."id", true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN "asset_warehouses" w
WHERE lower(u."email") = 'bsd@example.com'
  AND u."is_active" = true
  AND w."code" = 'SALE_STOCK'
ON CONFLICT ("user_id", "warehouse_id") DO UPDATE SET
  "can_view" = true,
  "can_manage" = true,
  "updated_at" = CURRENT_TIMESTAMP;
