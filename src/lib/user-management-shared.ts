import type {
  OrganizationLevel,
  OrganizationTag,
  ProjectTag,
  RoleCode,
  StockControllerTag,
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
  warehousePermissions: Array<{
    canManage: boolean;
    canView: boolean;
    warehouse: {
      code: string;
      id: string;
      name: string;
    };
  }>;
  email: string;
  ldapUsername: string | null;
  id: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  name: string;
  organizationLevel: OrganizationLevel | null;
  organizationTag: OrganizationTag | null;
  organizationAssignments: Array<{
    id: string;
    isPrimary: boolean;
    organizationLevel: OrganizationLevel;
    organizationTag: OrganizationTag;
  }>;
  position: string | null;
  projectTag: ProjectTag | null;
  roleCodes: RoleCode[];
  stockControllerTag: StockControllerTag | null;
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
  { group: "Executive", value: "EXECUTIVE" },
  { group: "Executive", value: "CONSULTANT" },
  { group: "Business Support Dept. (BSD)", value: "BSD_MANAGER" },
  { group: "Business Support Dept. (BSD)", value: "BSD_SUPERVISOR" },
  { group: "Business Support Dept. (BSD)", value: "BSD_STAFF" },
  { group: "Solution Consult", value: "SC_MANAGER" },
  { group: "System Network and Cloud (SCN)", value: "SCN_MANAGER" },
  { group: "System Network and Cloud (SCN)", value: "S1_SUPERVISOR" },
  { group: "System Network and Cloud (SCN)", value: "S1_STAFF" },
  { group: "System Network and Cloud (SCN)", value: "N1_SUPERVISOR" },
  { group: "System Network and Cloud (SCN)", value: "N1_STAFF" },
  { group: "System Network and Cloud (SCN)", value: "C1_SUPERVISOR" },
  { group: "System Network and Cloud (SCN)", value: "C1_STAFF" },
  { group: "Delivery & Client (DL)", value: "DL_MANAGER" },
  { group: "Delivery & Client (DL)", value: "DL_SUPERVISOR" },
  { group: "Delivery & Client (DL)", value: "DL_STAFF" },
  { group: "Engineering (EN)", value: "EN_MANAGER" },
  { group: "Customer Service", value: "CS_MANAGER" },
  { group: "Engineering (EN)", value: "CMS_SUPERVISOR" },
  { group: "Engineering (EN)", value: "CMS_STAFF" },
  { group: "Engineering (EN)", value: "SD_SUPERVISOR" },
  { group: "Engineering (EN)", value: "SD_STAFF" },
  { group: "Local / PRT", value: "PRT_SUPERVISOR" },
  { group: "Local / PRT", value: "PRT_STAFF" },
  { group: "Local", value: "LOCAL_SUPERVISOR" },
  { group: "Local", value: "LOCAL_STAFF" },
] as const satisfies ReadonlyArray<{
  group: string;
  value: OrganizationTag;
}>;

export const organizationTagLabels: Record<OrganizationTag, string> = {
  EXECUTIVE: "Executive",
  CONSULTANT: "Consultant",
  BSD_MANAGER: "BSD Manager (Accounting)",
  BSD_SUPERVISOR: "BSD Supervisor (Accounting)",
  BSD_STAFF: "BSD Staff (Accounting)",
  SC_MANAGER: "Solution Consult Manager",
  SCN_MANAGER: "System Network and Cloud Manager",
  S1_SUPERVISOR: "S1 Supervisor (System Engineer)",
  S1_STAFF: "S1 Staff (System Engineer)",
  N1_SUPERVISOR: "N1 Supervisor (Network Engineer)",
  N1_STAFF: "N1 Staff (Network Engineer)",
  C1_SUPERVISOR: "C1 Supervisor (Cloud Engineer)",
  C1_STAFF: "C1 Staff (Cloud Engineer)",
  DL_MANAGER: "Delivery & Client Manager",
  DL_SUPERVISOR: "Delivery & Client Supervisor",
  DL_STAFF: "Delivery & Client Staff",
  EN_MANAGER: "Engineering Manager",
  CS_MANAGER: "Customer Service Manager",
  CMS_SUPERVISOR: "CMS Supervisor",
  CMS_STAFF: "CMS Staff",
  SD_SUPERVISOR: "ServiceDesk Supervisor",
  SD_STAFF: "ServiceDesk Staff",
  PRT_SUPERVISOR: "PRT Supervisor (Local)",
  PRT_STAFF: "PRT Staff (Local)",
  LOCAL_SUPERVISOR: "Local Supervisor",
  LOCAL_STAFF: "Local Staff",
};

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

export const stockControllerTagOptions = [
  "HEAD_STOCK_CONTROLLER",
  "STOCK_CONTROLLER",
] as const satisfies readonly StockControllerTag[];

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
