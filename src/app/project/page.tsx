import { requireCurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import { getProjectManagementForAdmin } from "@/lib/project-management";
import {
  ProjectManagementForbidden,
  ProjectManagementPage,
} from "@/features/project-management/project-management-page";

export default async function ProjectRoute() {
  const user = await requireCurrentUser("/project");

  if (!hasRole(user, "ADMIN")) {
    return <ProjectManagementForbidden />;
  }

  const data = await getProjectManagementForAdmin(user);

  return <ProjectManagementPage initialProjects={data.projects} userOptions={data.users} />;
}
