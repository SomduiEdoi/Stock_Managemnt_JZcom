ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TABLE "projects" ADD COLUMN "customer_name" TEXT NOT NULL DEFAULT 'Unknown Customer';
CREATE TYPE "ProjectApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "project_approvals" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "approver_id" UUID NOT NULL,
  "status" "ProjectApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "comment" TEXT,
  "acted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_approvals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_approvals_project_id_approver_id_key" ON "project_approvals"("project_id", "approver_id");
CREATE INDEX "project_approvals_approver_id_status_idx" ON "project_approvals"("approver_id", "status");
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON UPDATE CASCADE;
