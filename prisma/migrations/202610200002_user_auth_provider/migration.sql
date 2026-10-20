CREATE TYPE "AuthProvider" AS ENUM ('AD', 'LOCAL');
ALTER TABLE "users" ADD COLUMN "provider" "AuthProvider" NOT NULL DEFAULT 'AD';
UPDATE "users" SET "provider" = 'LOCAL' WHERE "local_username" IS NOT NULL;
