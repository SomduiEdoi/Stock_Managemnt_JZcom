BEGIN;

-- Preserve test-account history but remove obsolete organization assignments.
DELETE FROM user_organization_assignments WHERE user_id IN
  (SELECT id FROM users WHERE local_username IN ('user1', 'user2'));
UPDATE users SET is_active = false, organization_tag = NULL, organization_level = NULL
WHERE local_username IN ('user1', 'user2');

CREATE TYPE "OrganizationTag_new" AS ENUM (
 'SERVICE_MANAGER', 'SOLUTION_ASST_MANAGER', 'SYSTEM_ENGINEER', 'SYSTEM_HELP_DESK',
 'NETWORK_ENGINEER', 'NETWORK_HELP_DESK', 'CLOUD_ENGINEER', 'CLOUD_HELP_DESK',
 'CUSTOMER_SERVICE_ENGINEER', 'CMS_ASST_ENGINEER', 'CMS_HELP_DESK',
 'SERVICE_DESK_ASST_ENGINEER', 'SERVICE_DESK_1_HELP_DESK', 'SERVICE_DESK_2_HELP_DESK',
 'DELIVERY_CLIENT_MANAGER', 'DELIVERY_CLIENT_HELP_DESK', 'BSD_HELP_DESK', 'WAREHOUSE_MANAGER'
);

CREATE FUNCTION pg_temp.map_organization_tag(tag text, mail text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
 WHEN tag IS NULL THEN NULL
 WHEN tag <> 'WAREHOUSE_MANAGER' AND mail = 'thawanat@jzcom.co.th' THEN 'CUSTOMER_SERVICE_ENGINEER'
 WHEN tag = 'SD_STAFF' AND mail IN ('alongkorn@jzcom.co.th', 'amornthep@jzcom.co.th') THEN 'SERVICE_DESK_2_HELP_DESK'
 ELSE CASE tag
 WHEN 'CS_MANAGER' THEN 'SERVICE_MANAGER'
 WHEN 'SC_MANAGER' THEN 'SOLUTION_ASST_MANAGER'
 WHEN 'S1_SUPERVISOR' THEN 'SYSTEM_ENGINEER'
 WHEN 'S1_STAFF' THEN 'SYSTEM_HELP_DESK'
 WHEN 'N1_SUPERVISOR' THEN 'NETWORK_ENGINEER'
 WHEN 'N1_STAFF' THEN 'NETWORK_HELP_DESK'
 WHEN 'C1_SUPERVISOR' THEN 'CLOUD_ENGINEER'
 WHEN 'C1_STAFF' THEN 'CLOUD_HELP_DESK'
 WHEN 'CMS_SUPERVISOR' THEN 'CMS_ASST_ENGINEER'
 WHEN 'CMS_STAFF' THEN 'CMS_HELP_DESK'
 WHEN 'SD_SUPERVISOR' THEN 'SERVICE_DESK_ASST_ENGINEER'
 WHEN 'SD_STAFF' THEN 'SERVICE_DESK_1_HELP_DESK'
 WHEN 'DL_MANAGER' THEN 'DELIVERY_CLIENT_MANAGER'
 WHEN 'DL_STAFF' THEN 'DELIVERY_CLIENT_HELP_DESK'
 WHEN 'BSD_STAFF' THEN 'BSD_HELP_DESK'
 ELSE tag END END
$$;

-- Copy email into an ephemeral lookup because ALTER TYPE USING cannot join users.
ALTER TABLE user_organization_assignments ADD COLUMN migration_email text;
UPDATE user_organization_assignments a SET migration_email = u.email FROM users u WHERE u.id = a.user_id;
ALTER TABLE users ALTER COLUMN organization_tag TYPE "OrganizationTag_new"
 USING pg_temp.map_organization_tag(organization_tag::text, email)::"OrganizationTag_new";
ALTER TABLE user_organization_assignments ALTER COLUMN organization_tag TYPE "OrganizationTag_new"
 USING pg_temp.map_organization_tag(organization_tag::text, migration_email)::"OrganizationTag_new";
ALTER TABLE user_organization_assignments DROP COLUMN migration_email;
DROP TYPE "OrganizationTag";
ALTER TYPE "OrganizationTag_new" RENAME TO "OrganizationTag";

CREATE TYPE "OrganizationLevel_new" AS ENUM ('MANAGER', 'SUPERVISOR', 'STAFF');
ALTER TABLE users ALTER COLUMN organization_level TYPE "OrganizationLevel_new"
 USING (CASE WHEN organization_tag::text = 'CUSTOMER_SERVICE_ENGINEER' THEN 'SUPERVISOR' ELSE organization_level::text END)::"OrganizationLevel_new";
ALTER TABLE user_organization_assignments ALTER COLUMN organization_level TYPE "OrganizationLevel_new"
 USING (CASE WHEN organization_tag::text = 'CUSTOMER_SERVICE_ENGINEER' THEN 'SUPERVISOR' ELSE organization_level::text END)::"OrganizationLevel_new";
DROP TYPE "OrganizationLevel";
ALTER TYPE "OrganizationLevel_new" RENAME TO "OrganizationLevel";

UPDATE user_organization_assignments SET team = CASE organization_tag::text
 WHEN 'SERVICE_MANAGER' THEN 'SERVICE'
 WHEN 'SOLUTION_ASST_MANAGER' THEN 'SOLUTION'
 WHEN 'CUSTOMER_SERVICE_ENGINEER' THEN 'CUSTOMER_SERVICE'
 WHEN 'SERVICE_DESK_1_HELP_DESK' THEN 'SD1'
 WHEN 'SERVICE_DESK_2_HELP_DESK' THEN 'SD2'
 ELSE team END;

-- Required tags drive authorization; snapshots remain untouched as historical evidence.
UPDATE transaction_approvals SET approval_required_tag = 'BSD_HELP_DESK'
WHERE approval_required_tag = 'BSD_STAFF';

COMMIT;
