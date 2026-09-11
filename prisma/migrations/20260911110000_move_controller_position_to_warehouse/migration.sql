-- Controller position is assigned per warehouse, not globally on the user.
ALTER TABLE "users" DROP COLUMN IF EXISTS "stock_controller_tags";
DROP TYPE IF EXISTS "StockControllerTag";
