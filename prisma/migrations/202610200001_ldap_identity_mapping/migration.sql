ALTER TABLE "users" ADD COLUMN "ldap_username" TEXT, ADD COLUMN "ldap_upn" TEXT;
CREATE UNIQUE INDEX "users_ldap_username_key" ON "users" ("ldap_username");
CREATE UNIQUE INDEX "users_ldap_upn_key" ON "users" ("ldap_upn");
