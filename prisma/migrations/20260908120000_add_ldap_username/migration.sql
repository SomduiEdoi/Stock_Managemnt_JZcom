ALTER TABLE "users" ADD COLUMN "ldap_username" TEXT;

CREATE UNIQUE INDEX "users_ldap_username_key" ON "users"("ldap_username");
