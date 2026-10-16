CREATE TYPE "ProjectApprovalAction" AS ENUM ('CREATE', 'EDIT');
ALTER TABLE "project_approvals" ADD COLUMN "action" "ProjectApprovalAction" NOT NULL DEFAULT 'EDIT';
ALTER TABLE "project_approvals" ADD COLUMN "payload" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "project_approvals" ADD COLUMN "previous" JSONB;
