ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'EXECUTIVE';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'CONSULTANT';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'BSD_SUPERVISOR';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'SC_MANAGER';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'DL_SUPERVISOR';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'CS_MANAGER';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'PRT_SUPERVISOR';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'PRT_STAFF';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'LOCAL_SUPERVISOR';
ALTER TYPE "OrganizationTag" ADD VALUE IF NOT EXISTS 'LOCAL_STAFF';

CREATE TABLE IF NOT EXISTS "user_organization_assignments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_level" "OrganizationLevel" NOT NULL,
  "organization_tag" "OrganizationTag" NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_organization_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_organization_assignments"
ADD CONSTRAINT "user_organization_assignments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "user_organization_assignments_user_id_organization_tag_key"
ON "user_organization_assignments"("user_id", "organization_tag");

CREATE UNIQUE INDEX IF NOT EXISTS "user_organization_assignments_one_primary_active"
ON "user_organization_assignments"("user_id")
WHERE "is_primary" = true AND "is_active" = true;

CREATE INDEX IF NOT EXISTS "user_organization_assignments_organization_tag_is_active_idx"
ON "user_organization_assignments"("organization_tag", "is_active");

CREATE INDEX IF NOT EXISTS "user_organization_assignments_user_id_is_primary_idx"
ON "user_organization_assignments"("user_id", "is_primary");

INSERT INTO "user_organization_assignments" (
  "id",
  "user_id",
  "organization_level",
  "organization_tag",
  "is_primary",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "id",
  "organization_level",
  "organization_tag",
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users"
WHERE "organization_level" IS NOT NULL
  AND "organization_tag" IS NOT NULL
ON CONFLICT ("user_id", "organization_tag") DO NOTHING;
