import { organizationPositions } from "./organization-matrix";
import { organizationTeams } from "./organization-team-options";

export const organizationPositionOptions = [
  { label: "Manager", value: "MANAGER", level: "MANAGER" },
  { label: "Asst. Manager", value: "ASST_MANAGER", level: "MANAGER" },
  { label: "Engineer", value: "ENGINEER", level: "SUPERVISOR" },
  { label: "Asst. Engineer", value: "ASST_ENGINEER", level: "SUPERVISOR" },
  { label: "Help Desk", value: "HELP_DESK", level: "STAFF" },
] as const;

export function positionForOrganizationTag(tag: string) {
  if (!organizationPositions.some((position) => position.tag === tag)) return "";
  if (tag.endsWith("ASST_MANAGER")) return "ASST_MANAGER";
  if (tag.endsWith("ASST_ENGINEER")) return "ASST_ENGINEER";
  if (tag.endsWith("ENGINEER")) return "ENGINEER";
  if (tag.endsWith("HELP_DESK")) return "HELP_DESK";
  return "MANAGER";
}

export function organizationTagForPosition(team: string, position: string) {
  return organizationPositions.find((entry) => entry.team === team && positionForOrganizationTag(entry.tag) === position)?.tag ?? "";
}

export function teamsForPosition(position: string) {
  return organizationTeams.filter((team) => !position || Boolean(organizationTagForPosition(team.value, position)));
}

export function organizationLevelForPosition(position: string) {
  return organizationPositionOptions.find((option) => option.value === position)?.level ?? "";
}
