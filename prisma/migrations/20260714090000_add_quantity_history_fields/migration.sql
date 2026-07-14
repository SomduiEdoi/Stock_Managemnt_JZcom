ALTER TYPE "AssetActionType" ADD VALUE IF NOT EXISTS 'ADJUST_QUANTITY';

ALTER TABLE "asset_status_histories"
ADD COLUMN "previous_quantity" INTEGER,
ADD COLUMN "new_quantity" INTEGER;