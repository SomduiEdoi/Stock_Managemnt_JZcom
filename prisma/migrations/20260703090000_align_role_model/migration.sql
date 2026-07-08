-- Align system roles with the markdown baseline:
-- ADMIN, STOCK_CONTROLLER, USER.
-- Domain ownership remains in user_domain_permissions.can_manage.

DROP INDEX IF EXISTS "roles_code_key";

ALTER TABLE "roles"
  ALTER COLUMN "code" TYPE TEXT
  USING "code"::TEXT;

UPDATE "roles"
SET
  "code" = CASE
    WHEN "code" IN ('SERVER_OWNER', 'NETWORK_OWNER', 'STOCK_OWNER') THEN 'STOCK_CONTROLLER'
    WHEN "code" IN ('STAFF', 'VIEWER') THEN 'USER'
    ELSE "code"
  END,
  "name" = CASE
    WHEN "code" IN ('SERVER_OWNER', 'NETWORK_OWNER', 'STOCK_OWNER') THEN 'Stock Controller'
    WHEN "code" IN ('STAFF', 'VIEWER') THEN 'User'
    WHEN "code" = 'ADMIN' THEN 'Admin'
    ELSE "name"
  END,
  "description" = CASE
    WHEN "code" IN ('SERVER_OWNER', 'NETWORK_OWNER', 'STOCK_OWNER') THEN 'Can manage assigned inventory domains and view other allowed domains.'
    WHEN "code" IN ('STAFF', 'VIEWER') THEN 'Can view assets and submit asset requests.'
    WHEN "code" = 'ADMIN' THEN 'Can manage all domains, users, imports, settings, and reports.'
    ELSE "description"
  END;

WITH role_merge AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "code" ORDER BY "created_at", "id") AS "keep_id"
  FROM "roles"
),
duplicate_memberships AS (
  SELECT "ur"."user_id", "ur"."role_id", "rm"."keep_id"
  FROM "user_roles" "ur"
  JOIN "role_merge" "rm" ON "rm"."id" = "ur"."role_id"
  WHERE "rm"."id" <> "rm"."keep_id"
)
DELETE FROM "user_roles" "ur"
USING "duplicate_memberships" "dm"
WHERE "ur"."user_id" = "dm"."user_id"
  AND "ur"."role_id" = "dm"."role_id"
  AND EXISTS (
    SELECT 1
    FROM "user_roles" "existing"
    WHERE "existing"."user_id" = "dm"."user_id"
      AND "existing"."role_id" = "dm"."keep_id"
  );

WITH role_merge AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "code" ORDER BY "created_at", "id") AS "keep_id"
  FROM "roles"
)
UPDATE "user_roles" "ur"
SET "role_id" = "rm"."keep_id"
FROM "role_merge" "rm"
WHERE "ur"."role_id" = "rm"."id"
  AND "rm"."id" <> "rm"."keep_id";

WITH role_merge AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "code" ORDER BY "created_at", "id") AS "keep_id"
  FROM "roles"
)
DELETE FROM "roles" "r"
USING "role_merge" "rm"
WHERE "r"."id" = "rm"."id"
  AND "rm"."id" <> "rm"."keep_id";

CREATE TYPE "RoleCode_new" AS ENUM ('ADMIN', 'STOCK_CONTROLLER', 'USER');

ALTER TABLE "roles"
  ALTER COLUMN "code" TYPE "RoleCode_new"
  USING "code"::"RoleCode_new";

ALTER TYPE "RoleCode" RENAME TO "RoleCode_old";
ALTER TYPE "RoleCode_new" RENAME TO "RoleCode";
DROP TYPE "RoleCode_old";

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
