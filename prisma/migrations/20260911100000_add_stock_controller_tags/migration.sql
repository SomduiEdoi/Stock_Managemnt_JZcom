-- Allow a stock controller to hold one or both stock responsibilities.
ALTER TABLE "users"
  ADD COLUMN "stock_controller_tags" "StockControllerTag"[] NOT NULL DEFAULT ARRAY[]::"StockControllerTag"[];

UPDATE "users"
SET "stock_controller_tags" = ARRAY["stock_controller_tag"]::"StockControllerTag"[]
WHERE "stock_controller_tag" IS NOT NULL;

ALTER TABLE "users" DROP COLUMN "stock_controller_tag";
