-- Draft cart reservations for quantity-tracked assets.
-- Serial assets continue to use request lock fields and REQUEST status.

CREATE TABLE "asset_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "asset_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "asset_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_reservations_asset_id_user_id_key"
  ON "asset_reservations"("asset_id", "user_id");

CREATE INDEX "asset_reservations_asset_id_idx"
  ON "asset_reservations"("asset_id");

CREATE INDEX "asset_reservations_user_id_idx"
  ON "asset_reservations"("user_id");

ALTER TABLE "asset_reservations"
  ADD CONSTRAINT "asset_reservations_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_reservations"
  ADD CONSTRAINT "asset_reservations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
