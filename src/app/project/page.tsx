import { requireCurrentUser } from "@/lib/auth";
import { getProjectManagementData } from "@/lib/project-management";
import { ProjectManagementPage } from "@/features/project-management/project-management-page";

export default async function ProjectRoute() {
  const user = await requireCurrentUser("/project");
  const data = await getProjectManagementData(user);

  return (
    <ProjectManagementPage
      canCreate={data.canCreate}
      initialProjects={data.projects}
      userOptions={data.users}
    />
  );
}
