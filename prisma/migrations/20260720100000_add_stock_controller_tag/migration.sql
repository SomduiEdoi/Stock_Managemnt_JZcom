CREATE TYPE "StockControllerTag" AS ENUM ('HEAD_STOCK_CONTROLLER', 'STOCK_CONTROLLER');

ALTER TABLE "users"
ADD COLUMN "stock_controller_tag" "StockControllerTag";

UPDATE "users"
SET "stock_controller_tag" = 'STOCK_CONTROLLER'
WHERE "id" IN (
  SELECT "user_roles"."user_id"
  FROM "user_roles"
  INNER JOIN "roles" ON "roles"."id" = "user_roles"."role_id"
  WHERE "roles"."code" = 'STOCK_CONTROLLER'
);
