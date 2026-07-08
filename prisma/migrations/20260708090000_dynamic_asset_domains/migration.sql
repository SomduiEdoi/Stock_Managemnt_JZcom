-- Allow inventory domains to be created dynamically by admins.
ALTER TABLE "asset_domains"
  ALTER COLUMN "code" TYPE TEXT USING "code"::TEXT;

DROP TYPE IF EXISTS "AssetDomainCode";
