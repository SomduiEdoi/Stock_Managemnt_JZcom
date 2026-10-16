DROP INDEX IF EXISTS "project_approvals_project_id_approver_id_key";

CREATE INDEX IF NOT EXISTS "project_approvals_project_id_approver_id_status_idx"
  ON "project_approvals"("project_id", "approver_id", "status");
