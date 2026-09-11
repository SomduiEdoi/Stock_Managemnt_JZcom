-- Preserve the user record while clearing test and unmatched account emails.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

UPDATE "users"
SET "email" = NULL
WHERE "ldap_username" IS NULL
   OR LOWER("email") LIKE '%@example.com';

DROP INDEX IF EXISTS "users_ldap_username_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "ldap_username";
