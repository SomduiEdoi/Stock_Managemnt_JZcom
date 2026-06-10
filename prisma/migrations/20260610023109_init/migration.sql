-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'STOCK_OWNER', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetDomainCode" AS ENUM ('SERVER', 'NETWORK');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('READY', 'BORROW', 'USING', 'SOLD', 'FAIL', 'LOST', 'NEED_CHECK', 'WAIT');

-- CreateEnum
CREATE TYPE "AssetActionType" AS ENUM ('CREATE', 'STATUS_CHANGE', 'BORROW', 'RETURN', 'USE_INTERNAL', 'SELL', 'MARK_FAIL', 'MARK_LOST', 'MARK_NEED_CHECK', 'MARK_WAIT', 'STOCK_CHECK', 'IMPORT');

-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "MigrationRowStatus" AS ENUM ('PENDING', 'IMPORTED', 'FAILED', 'SKIPPED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "asset_domains" (
    "id" UUID NOT NULL,
    "code" "AssetDomainCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_domain_permissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_manage" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_domain_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_models" (
    "id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "category_id" UUID,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model_no" TEXT,
    "part_no" TEXT,
    "type_name" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "asset_model_id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "location_id" UUID,
    "serial_no" TEXT NOT NULL,
    "asset_no" TEXT,
    "stock_code" TEXT,
    "status" "AssetStatus" NOT NULL,
    "note" TEXT,
    "image_ref" TEXT,
    "legacy_qty" INTEGER,
    "legacy_fg" INTEGER,
    "location_text" TEXT,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "migration_batch_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_status_histories" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "from_status" "AssetStatus",
    "to_status" "AssetStatus" NOT NULL,
    "action_type" "AssetActionType" NOT NULL,
    "note" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_batches" (
    "id" UUID NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'SharePoint',
    "file_name" TEXT,
    "status" "MigrationStatus" NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "migration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_rows" (
    "id" UUID NOT NULL,
    "migration_batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "mapped_data" JSONB,
    "status" "MigrationRowStatus" NOT NULL,
    "error_message" TEXT,
    "asset_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_domains_code_key" ON "asset_domains"("code");

-- CreateIndex
CREATE INDEX "user_domain_permissions_domain_id_idx" ON "user_domain_permissions"("domain_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_domain_permissions_user_id_domain_id_key" ON "user_domain_permissions"("user_id", "domain_id");

-- CreateIndex
CREATE INDEX "asset_categories_domain_id_idx" ON "asset_categories"("domain_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_domain_id_name_key" ON "asset_categories"("domain_id", "name");

-- CreateIndex
CREATE INDEX "asset_models_domain_id_idx" ON "asset_models"("domain_id");

-- CreateIndex
CREATE INDEX "asset_models_category_id_idx" ON "asset_models"("category_id");

-- CreateIndex
CREATE INDEX "asset_models_name_idx" ON "asset_models"("name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_serial_no_key" ON "assets"("serial_no");

-- CreateIndex
CREATE INDEX "assets_domain_id_idx" ON "assets"("domain_id");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_location_id_idx" ON "assets"("location_id");

-- CreateIndex
CREATE INDEX "assets_asset_model_id_idx" ON "assets"("asset_model_id");

-- CreateIndex
CREATE INDEX "assets_source_record_id_idx" ON "assets"("source_record_id");

-- CreateIndex
CREATE INDEX "assets_stock_code_idx" ON "assets"("stock_code");

-- CreateIndex
CREATE INDEX "asset_status_histories_asset_id_idx" ON "asset_status_histories"("asset_id");

-- CreateIndex
CREATE INDEX "asset_status_histories_to_status_idx" ON "asset_status_histories"("to_status");

-- CreateIndex
CREATE INDEX "asset_status_histories_changed_at_idx" ON "asset_status_histories"("changed_at");

-- CreateIndex
CREATE INDEX "asset_status_histories_changed_by_idx" ON "asset_status_histories"("changed_by");

-- CreateIndex
CREATE INDEX "migration_rows_migration_batch_id_idx" ON "migration_rows"("migration_batch_id");

-- CreateIndex
CREATE INDEX "migration_rows_asset_id_idx" ON "migration_rows"("asset_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_domain_permissions" ADD CONSTRAINT "user_domain_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_domain_permissions" ADD CONSTRAINT "user_domain_permissions_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "asset_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "asset_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "asset_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_model_id_fkey" FOREIGN KEY ("asset_model_id") REFERENCES "asset_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "asset_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_migration_batch_id_fkey" FOREIGN KEY ("migration_batch_id") REFERENCES "migration_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_histories" ADD CONSTRAINT "asset_status_histories_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_histories" ADD CONSTRAINT "asset_status_histories_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_batches" ADD CONSTRAINT "migration_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_rows" ADD CONSTRAINT "migration_rows_migration_batch_id_fkey" FOREIGN KEY ("migration_batch_id") REFERENCES "migration_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_rows" ADD CONSTRAINT "migration_rows_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
