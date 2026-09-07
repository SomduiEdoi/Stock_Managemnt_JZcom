CREATE TABLE "project_lead_changes" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "changed_by" UUID NOT NULL,
  "previous_lead_ids" JSONB,
  "next_lead_ids" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_lead_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_lead_changes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_lead_changes_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "project_lead_changes_project_id_created_at_idx" ON "project_lead_changes"("project_id", "created_at");
