ALTER TABLE "assets"
  ADD COLUMN "is_recommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recommended_at" TIMESTAMP(3);

CREATE INDEX "assets_warehouse_id_is_recommended_recommended_at_idx"
  ON "assets"("warehouse_id", "is_recommended", "recommended_at");
