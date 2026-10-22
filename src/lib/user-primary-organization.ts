import { organizationTeams, teamForOrganizationTag } from "./organization-team-options";
import { organizationPositionOptions, positionForOrganizationTag } from "./organization-position-options";

type OrganizationUser = {
  organizationTag: string | null;
  organizationAssignments: Array<{ isPrimary: boolean; organizationTag: string; team?: string | null }>;
};

export function primaryOrganizationDisplay(user: OrganizationUser) {
  const primary = user.organizationAssignments.find((assignment) => assignment.isPrimary);
  const tag = primary?.organizationTag ?? (user.organizationAssignments.length === 0 ? user.organizationTag : null);
  if (!tag) return { team: "-", organization: "-" };
  const team = primary?.team ?? teamForOrganizationTag(tag);
  const position = positionForOrganizationTag(tag);
  return {
    team: organizationTeams.find((option) => option.value === team)?.label ?? "-",
    organization: organizationPositionOptions.find((option) => option.value === position)?.label ?? "-",
  };
}
