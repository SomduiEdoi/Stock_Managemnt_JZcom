import type { OrganizationTag } from "@prisma/client";
import { organizationPositions } from "./organization-matrix";

export const organizationTeams = [
  { label: "Service", value: "SERVICE" },
  { label: "Solution Consult", value: "SOLUTION" },
  { label: "System", value: "SYSTEM" },
  { label: "Network", value: "NETWORK" },
  { label: "Cloud", value: "CLOUD" },
  { label: "Customer Service", value: "CUSTOMER_SERVICE" },
  { label: "CMS", value: "CMS" },
  { label: "Service Desk", value: "SD" },
  { label: "Service Desk 1", value: "SD1" },
  { label: "Service Desk 2", value: "SD2" },
  { label: "Delivery & Client", value: "DL" },
  { label: "BSD", value: "BSD" },
  { label: "Warehouse", value: "WAREHOUSE" },
];

export function teamForOrganizationTag(tag: string) {
  return organizationPositions.find((position) => position.tag === tag)?.team ?? "";
}

export function organizationTagForTeam(team: string, level: string): OrganizationTag | "" {
  return organizationPositions.find((position) => position.team === team && position.level === level)?.tag ?? "";
}

export function organizationTeamDropdownOptions(level: string) {
  return organizationTeams.filter((team) => !level || organizationPositions.some((position) => position.team === team.value && position.level === level));
}

export function organizationAssignmentKey(assignment: { team?: string | null; organizationLevel: string; organizationTag: string }) {
  return `${assignment.team ?? teamForOrganizationTag(assignment.organizationTag)}:${assignment.organizationLevel}:${assignment.organizationTag}`;
}
