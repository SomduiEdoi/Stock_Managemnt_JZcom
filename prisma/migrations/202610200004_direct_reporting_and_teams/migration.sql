ALTER TYPE "OrganizationTag" ADD VALUE 'STAFF';
ALTER TYPE "OrganizationTag" ADD VALUE 'SUPERVISOR';
ALTER TYPE "OrganizationTag" ADD VALUE 'MANAGER';
ALTER TABLE "user_organization_assignments" ADD COLUMN "team" VARCHAR(32);
UPDATE "user_organization_assignments" SET "team" = CASE
  WHEN organization_tag::text LIKE 'S1_%' THEN 'SYSTEM'
  WHEN organization_tag::text LIKE 'N1_%' THEN 'NETWORK'
  WHEN organization_tag::text LIKE 'C1_%' THEN 'CLOUD'
  WHEN organization_tag::text LIKE 'CMS_%' THEN 'CMS'
  WHEN organization_tag::text LIKE 'SD_%' THEN 'SD'
  WHEN organization_tag::text LIKE 'PRT_%' THEN 'PRT'
  WHEN organization_tag::text LIKE 'DL_%' THEN 'DL'
  WHEN organization_tag::text LIKE 'BSD_%' THEN 'BSD'
  WHEN organization_tag::text = 'SC_MANAGER' THEN 'SOLUTION'
  WHEN organization_tag::text = 'CS_MANAGER' THEN 'SERVICE'
  ELSE NULL END;
DROP INDEX "user_organization_assignments_user_id_organization_tag_key";
CREATE INDEX "user_organization_assignments_user_id_organization_tag_idx" ON "user_organization_assignments"("user_id", "organization_tag");
CREATE UNIQUE INDEX "user_organization_assignments_user_id_team_organization_level_key" ON "user_organization_assignments"("user_id", "team", "organization_level");
