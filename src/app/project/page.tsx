import { requireCurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import {
  ProjectManagementForbidden,
  ProjectManagementPage,
} from "@/features/project-management/project-management-page";

export default async function ProjectRoute() {
  const user = await requireCurrentUser("/project");

  if (!hasRole(user, "ADMIN")) {
    return <ProjectManagementForbidden />;
  }

  return <ProjectManagementPage />;
}
