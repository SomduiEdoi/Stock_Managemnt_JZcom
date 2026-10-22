import { organizationPositions } from "./organization-matrix";
import type {
  OrganizationLevel,
  OrganizationTag,
  ProjectTag,
  RoleCode,
} from "@prisma/client";

export type UserStatusFilter = "ACTIVE" | "ALL" | "BLOCKED";
export type UserSystemRole = "ADMIN" | "STOREMAN" | "USER";

export type UserManagementFilters = {
  page: number;
  pageSize: number;
  role: UserSystemRole | "ALL";
  search: string;
  status: UserStatusFilter;
  team?: string;
};

export type UserManagementRow = {
  provider?: "AD" | "LOCAL";
  localUsername?: string | null;
  warehousePermissions: Array<{
    canManage: boolean;
    canView: boolean;
    warehouse: {
      code: string;
      id: string;
      name: string;
    };
  }>;
  email: string | null;
  id: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  name: string;
  organizationLevel: OrganizationLevel | null;
  organizationTag: OrganizationTag | null;
  organizationAssignments: Array<{
    team?: string | null;
    id: string;
    isPrimary: boolean;
    organizationLevel: OrganizationLevel;
    organizationTag: OrganizationTag;
  }>;
  position: string | null;
  projectTag: ProjectTag | null;
  roleCodes: RoleCode[];
  systemRole: UserSystemRole;
};

export type UserManagementMetrics = {
  active: number;
  owners: number;
  staff: number;
  total: number;
};

export type WarehouseOption = {
  code: string;
  id: string;
  name: string;
};

export const userRoleOptions = [
  "ADMIN",
  "STOREMAN",
  "USER",
] as const satisfies readonly UserSystemRole[];

export const organizationLevelOptions = ["MANAGER", "SUPERVISOR", "STAFF"] as const satisfies readonly OrganizationLevel[];

export const organizationUnitOptions = organizationPositions.map((position) => ({
  group: position.team,
  value: position.tag,
}));

export const organizationTagLabels: Record<OrganizationTag, string> = Object.fromEntries(
  organizationPositions.map((position) => [position.tag, position.label]),
) as Record<OrganizationTag, string>;

export function organizationTagLabel(tag: OrganizationTag | string | null) {
  if (!tag) {
    return "-";
  }

  return organizationTagLabels[tag as OrganizationTag] ?? tag.replaceAll("_", " ");
}

export const projectTagOptions = [
  "LEAD_PROJECT",
  "TEAM_MEMBER",
] as const satisfies readonly ProjectTag[];

export function buildUserManagementHref(
  filters: UserManagementFilters,
  overrides: Partial<UserManagementFilters> = {},
) {
  const nextFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (nextFilters.search) {
    params.set("q", nextFilters.search);
  }

  if (nextFilters.role !== "ALL") {
    params.set("role", nextFilters.role);
  }

  if (nextFilters.team && nextFilters.team !== "ALL") {
    params.set("team", nextFilters.team);
  }

  if (nextFilters.status !== "ALL") {
    params.set("status", nextFilters.status);
  }

  if (nextFilters.page > 1) {
    params.set("page", String(nextFilters.page));
  }

  return `/user${params.size ? `?${params.toString()}` : ""}`;
}
