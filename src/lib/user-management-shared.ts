import type {
  OrganizationLevel,
  OrganizationTag,
  ProjectTag,
  RoleCode,
} from "@prisma/client";

export type UserStatusFilter = "ACTIVE" | "ALL" | "BLOCKED";
export type UserSystemRole = "ADMIN" | "STOCK_CONTROLLER" | "USER";

export type UserManagementFilters = {
  page: number;
  pageSize: number;
  role: UserSystemRole | "ALL";
  search: string;
  status: UserStatusFilter;
};

export type UserManagementRow = {
  domainPermissions: Array<{
    canManage: boolean;
    canView: boolean;
    domain: {
      code: string;
      id: string;
      name: string;
    };
  }>;
  email: string;
  id: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  name: string;
  organizationLevel: OrganizationLevel | null;
  organizationTag: OrganizationTag | null;
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

export type DomainOption = {
  code: string;
  id: string;
  name: string;
};

export const userRoleOptions = [
  "ADMIN",
  "STOCK_CONTROLLER",
  "USER",
] as const satisfies readonly UserSystemRole[];

export const organizationLevelOptions = [
  "EXECUTIVE",
  "MANAGER",
  "SUPERVISOR",
  "STAFF",
] as const satisfies readonly OrganizationLevel[];

export const organizationUnitOptions = [
  { group: "Business Support Dept. (BSD)", value: "BSD_MANAGER" },
  { group: "Business Support Dept. (BSD)", value: "BSD_STAFF" },
  { group: "System Network and Cloud (SCN)", value: "SCN_MANAGER" },
  { group: "System Network and Cloud (SCN)", value: "S1_SUPERVISOR" },
  { group: "System Network and Cloud (SCN)", value: "S1_STAFF" },
  { group: "System Network and Cloud (SCN)", value: "N1_SUPERVISOR" },
  { group: "System Network and Cloud (SCN)", value: "N1_STAFF" },
  { group: "System Network and Cloud (SCN)", value: "C1_SUPERVISOR" },
  { group: "System Network and Cloud (SCN)", value: "C1_STAFF" },
  { group: "Delivery & Client (DL)", value: "DL_MANAGER" },
  { group: "Delivery & Client (DL)", value: "DL_STAFF" },
  { group: "Engineering (EN)", value: "EN_MANAGER" },
  { group: "Engineering (EN)", value: "CMS_SUPERVISOR" },
  { group: "Engineering (EN)", value: "CMS_STAFF" },
  { group: "Engineering (EN)", value: "SD_SUPERVISOR" },
  { group: "Engineering (EN)", value: "SD_STAFF" },
] as const satisfies ReadonlyArray<{
  group: string;
  value: OrganizationTag;
}>;

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

  if (nextFilters.status !== "ALL") {
    params.set("status", nextFilters.status);
  }

  if (nextFilters.page > 1) {
    params.set("page", String(nextFilters.page));
  }

  return `/user${params.size ? `?${params.toString()}` : ""}`;
}
