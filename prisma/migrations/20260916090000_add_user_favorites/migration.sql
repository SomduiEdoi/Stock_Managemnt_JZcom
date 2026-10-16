CREATE TABLE "user_favorites" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_favorites_user_id_asset_id_key" ON "user_favorites"("user_id", "asset_id");
CREATE INDEX "user_favorites_user_id_idx" ON "user_favorites"("user_id");
CREATE INDEX "user_favorites_asset_id_idx" ON "user_favorites"("asset_id");
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
