import type { UserManagementRow } from "./user-management-shared";
import { organizationTagLabel } from "./user-management-shared";
import { organizationTeams, teamForOrganizationTag } from "./organization-team-options";
import { primaryOrganizationDisplay } from "./user-primary-organization";

export function userMatchesTeam(user: UserManagementRow, teamFilter: string | undefined) {
  if (!teamFilter || teamFilter === "ALL") return true;
  const primary = user.organizationAssignments.find((assignment) => assignment.isPrimary);
  const team = primary ? primary.team ?? teamForOrganizationTag(primary.organizationTag)
    : user.organizationAssignments.length === 0 ? teamForOrganizationTag(user.organizationTag ?? "") : "";
  return team === teamFilter;
}

export function userMatchesSearch(user: UserManagementRow, query: string) {
  const primary = primaryOrganizationDisplay(user);
  const fields = [user.id, user.name, user.email, user.localUsername, user.provider,
    user.provider === "LOCAL" ? "Local Account" : "Active Directory AD", user.position,
    user.systemRole, ...user.roleCodes, user.isActive ? "Active" : "Blocked Inactive",
    user.organizationLevel, user.organizationTag, user.projectTag, primary.team, primary.organization,
    user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : "",
    ...user.organizationAssignments.flatMap((assignment) => {
      const team = assignment.team ?? teamForOrganizationTag(assignment.organizationTag);
      return [team, organizationTeams.find((entry) => entry.value === team)?.label,
        assignment.organizationLevel, assignment.organizationTag, organizationTagLabel(assignment.organizationTag)];
    }),
    ...user.warehousePermissions.flatMap((permission) => [permission.warehouse.name, permission.warehouse.code]),
  ];
  const normalize = (text: string) => text.toLowerCase().replace(/[_\s]+/g, " ").trim();
  const haystack = normalize(fields.filter(Boolean).join(" "));
  return normalize(query).split(" ").every((word) => haystack.includes(word));
}
