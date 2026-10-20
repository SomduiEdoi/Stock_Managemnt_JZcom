import type { OrganizationTag } from "@prisma/client";

export const organizationTeams = [
  { label: "System", value: "SYSTEM", tags: { STAFF: "S1_STAFF", SUPERVISOR: "S1_SUPERVISOR" } },
  { label: "Network", value: "NETWORK", tags: { STAFF: "N1_STAFF", SUPERVISOR: "N1_SUPERVISOR" } },
  { label: "Cloud", value: "CLOUD", tags: { STAFF: "C1_STAFF", SUPERVISOR: "C1_SUPERVISOR" } },
  { label: "CMS", value: "CMS", tags: { STAFF: "CMS_STAFF", SUPERVISOR: "CMS_SUPERVISOR" } },
  { label: "Service Desk", value: "SD", tags: { STAFF: "SD_STAFF", SUPERVISOR: "SD_SUPERVISOR" } },
  { label: "PRT", value: "PRT", tags: { STAFF: "PRT_STAFF", SUPERVISOR: "PRT_SUPERVISOR" } },
  { label: "Delivery & Client", value: "DL", tags: { STAFF: "DL_STAFF", SUPERVISOR: "DL_SUPERVISOR", MANAGER: "DL_MANAGER" } },
  { label: "BSD", value: "BSD", tags: { STAFF: "BSD_STAFF", SUPERVISOR: "BSD_SUPERVISOR", MANAGER: "BSD_MANAGER" } },
  { label: "Service", value: "SERVICE", tags: { MANAGER: "CS_MANAGER" } },
  { label: "Solution", value: "SOLUTION", tags: { MANAGER: "SC_MANAGER" } },
  { label: "Warehouse", value: "WAREHOUSE", tags: { MANAGER: "WAREHOUSE_MANAGER" } },
] satisfies Array<{ label: string; value: string; tags: Partial<Record<string, OrganizationTag>> }>;

export function teamForOrganizationTag(tag: string) {
  return organizationTeams.find((team) => Object.values(team.tags).includes(tag as OrganizationTag))?.value ?? "";
}

export function organizationTagForTeam(team: string, level: string): OrganizationTag | "" {
  const entry = organizationTeams.find((option) => option.value === team);
  if (!entry || !["STAFF", "SUPERVISOR", "MANAGER", "EXECUTIVE", "CONSULTANT"].includes(level)) return "";
  return (entry.tags as Partial<Record<string, OrganizationTag>>)[level] ?? level as OrganizationTag;
}

export function organizationTeamDropdownOptions(level: string) {
  void level;
  return organizationTeams.map((team) => ({ label: team.label, value: team.value }));
}

export function organizationAssignmentKey(assignment: { team?: string | null; organizationLevel: string; organizationTag: string }) {
  return `${assignment.team ?? teamForOrganizationTag(assignment.organizationTag)}:${assignment.organizationLevel}:${assignment.organizationTag}`;
}
