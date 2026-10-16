type ProjectLabel = {
  customerName?: string | null;
  name?: string | null;
  projectId?: string | null;
};

export function formatProjectLabel(project: ProjectLabel | null | undefined) {
  if (!project) return "-";
  const title = [project.customerName?.trim(), project.name?.trim()].filter(Boolean).join("-");
  const code = project.projectId?.trim();
  return `${title}${code ? `${title ? " " : ""}(${code})` : ""}` || "-";
}
