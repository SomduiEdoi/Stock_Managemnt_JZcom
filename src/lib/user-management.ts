import bcrypt from "bcryptjs";
import {
  OrganizationLevel,
  OrganizationTag,
  Prisma,
  ProjectTag,
  RoleCode,
  StockControllerTag,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";
import {
  UserStatusFilter,
  UserSystemRole,
  UserManagementFilters,
  UserManagementRow,
  UserManagementMetrics,
  DomainOption,
  userRoleOptions,
  organizationLevelOptions,
  organizationUnitOptions,
  projectTagOptions,
  stockControllerTagOptions,
  buildUserManagementHref,
} from "./user-management-shared";

export type {
  UserStatusFilter,
  UserSystemRole,
  UserManagementFilters,
  UserManagementRow,
  UserManagementMetrics,
  DomainOption,
};

export {
  userRoleOptions,
  organizationLevelOptions,
  organizationUnitOptions,
  projectTagOptions,
  stockControllerTagOptions,
  buildUserManagementHref,
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: UserManagementFilters = {
  page: 1,
  pageSize: 10,
  role: "ALL",
  search: "",
  status: "ALL",
};

const defaultPassword = "ChangeMe123!";

const userRowSelect = Prisma.validator<Prisma.UserSelect>()({
  email: true,
  id: true,
  isActive: true,
  lastLoginAt: true,
  name: true,
  organizationLevel: true,
  organizationTag: true,
  position: true,
  projectTag: true,
  stockControllerTag: true,
  roles: {
    select: {
      role: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  },
  domainPermissions: {
    where: { domain: { isActive: true } },
    select: {
      canManage: true,
      canView: true,
      domain: {
        select: {
          code: true,
          id: true,
          name: true,
        },
      },
    },
  },
});

type UserRecord = Prisma.UserGetPayload<{
  select: typeof userRowSelect;
}>;

export type UpsertManagedUserInput = {
  email: string;
  name: string;
  organizationLevel?: OrganizationLevel | null;
  organizationTag?: OrganizationTag | null;
  role: UserSystemRole;
  stockControllerTag?: StockControllerTag | null;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : defaultFilters.page;
}

function parseStatus(value: string | undefined): UserStatusFilter {
  if (value === "ACTIVE" || value === "BLOCKED") {
    return value;
  }

  return defaultFilters.status;
}

function isUserSystemRole(value: string | undefined): value is UserSystemRole {
  return userRoleOptions.includes(value as UserSystemRole);
}

function containsText(value: string, search: string) {
  return value.toLowerCase().includes(search.toLowerCase());
}

function inferSystemRole(user: UserRecord): UserSystemRole {
  const roleCodes = user.roles.map(({ role }) => role.code);

  if (roleCodes.includes("ADMIN")) {
    return "ADMIN";
  }

  if (
    roleCodes.includes("STOCK_CONTROLLER") ||    user.domainPermissions.some((permission) => permission.canManage)
  ) {
    return "STOCK_CONTROLLER";
  }

  return "USER";
}

function toRow(user: UserRecord): UserManagementRow {
  return {
    domainPermissions: user.domainPermissions,
    email: user.email,
    id: user.id,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    organizationLevel: user.organizationLevel,
    organizationTag: user.organizationTag,
    position: user.position,
    projectTag: user.projectTag,
    roleCodes: user.roles.map(({ role }) => role.code),
    stockControllerTag: user.stockControllerTag,
    systemRole: inferSystemRole(user),
  };
}

function matchesUserFilters(user: UserManagementRow, filters: UserManagementFilters) {
  if (filters.role !== "ALL" && user.systemRole !== filters.role) {
    return false;
  }

  if (filters.status === "ACTIVE" && !user.isActive) {
    return false;
  }

  if (filters.status === "BLOCKED" && user.isActive) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const search = filters.search.toLowerCase();
  const haystacks = [
    user.email,
    user.name,
    user.position ?? "",
    user.systemRole,
    user.organizationLevel ?? "",
    user.organizationTag ?? "",
    user.projectTag ?? "",
    user.stockControllerTag ?? "",
    ...user.domainPermissions.map((permission) => permission.domain.name),
    ...user.domainPermissions.map((permission) => permission.domain.code),
  ];

  return haystacks.some((value) => containsText(value, search));
}

function sortUsers(users: UserManagementRow[]) {
  return [...users].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "en");
  });
}

async function loadAllUsers() {
  const users = await db.user.findMany({
    where: {
      roles: {
        none: {
          role: {
            code: "ADMIN",
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: userRowSelect,
  });

  return users.map(toRow);
}

async function getUserMetrics(allUsers: UserManagementRow[]): Promise<UserManagementMetrics> {
  return {
    active: allUsers.filter((user) => user.isActive).length,
    owners: allUsers.filter((user) => user.systemRole === "STOCK_CONTROLLER")
      .length,
    staff: allUsers.filter((user) => user.systemRole === "USER").length,
    total: allUsers.length,
  };
}

function ensureAdmin(user: CurrentUser) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin users can manage system accounts.", 403);
  }
}

async function getRoleId(roleCode: RoleCode) {
  const role = await db.role.findUnique({
    where: { code: roleCode },
    select: { id: true },
  });

  if (!role) {
    throw new WorkflowError(`Missing role configuration for ${roleCode}.`, 500);
  }

  return role.id;
}

async function getDomainOptions() {
  return db.assetDomain.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { code: true, id: true, name: true },
  });
}

async function syncRole(userId: string, nextRoleCode: RoleCode) {
  const roleId = await getRoleId(nextRoleCode);

  await db.userRole.deleteMany({ where: { userId } });
  await db.userRole.create({
    data: {
      roleId,
      userId,
    },
  });
}

async function syncDomainPermissionsForUser(
  userId: string,
  systemRole: UserSystemRole,
) {
  const domains = await getDomainOptions();

  await db.userDomainPermission.deleteMany({ where: { userId } });

  if (systemRole === "ADMIN") {
    return;
  }

  const permissionRows = domains.map((domain) => ({
    canManage: false,
    canView: true,
    domainId: domain.id,
    userId,
  }));

  await db.userDomainPermission.createMany({ data: permissionRows });
}

function validateManagedUserInput(input: UpsertManagedUserInput) {
  if (!input.email.trim()) {
    throw new WorkflowError("Email is required.");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input.email.trim())) {
    throw new WorkflowError("Email must be a valid email address.");
  }

  if (!input.name.trim()) {
    throw new WorkflowError("Name is required.");
  }

  if (input.role === "STOCK_CONTROLLER" && !input.stockControllerTag) {
    throw new WorkflowError("Stock controller tag is required for Stock Controller.");
  }

  if (input.role === "USER") {
    if (!input.organizationLevel) {
      throw new WorkflowError("Organization level is required for User.");
    }

    if (!input.organizationTag) {
      throw new WorkflowError("Organization unit/team tag is required for User.");
    }
  }
}

function validateManagedUserUpdateInput(
  input: Omit<UpsertManagedUserInput, "email">,
) {
  if (!input.name.trim()) {
    throw new WorkflowError("Name is required.");
  }

  if (input.role === "STOCK_CONTROLLER" && !input.stockControllerTag) {
    throw new WorkflowError("Stock controller tag is required for Stock Controller.");
  }

  if (input.role === "USER") {
    if (!input.organizationLevel) {
      throw new WorkflowError("Organization level is required for User.");
    }

    if (!input.organizationTag) {
      throw new WorkflowError("Organization unit/team tag is required for User.");
    }
  }
}

function normalizeRoleCode(systemRole: UserSystemRole): RoleCode {
  if (systemRole === "ADMIN") {
    return "ADMIN";
  }

  if (systemRole === "STOCK_CONTROLLER") {
    return "STOCK_CONTROLLER";
  }

  return "USER";
}

export function normalizeUserManagementFilters(
  searchParams: SearchParams,
): UserManagementFilters {
  const role = firstParam(searchParams.role);

  return {
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    role: isUserSystemRole(role) ? role : defaultFilters.role,
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    status: parseStatus(firstParam(searchParams.status)),
  };
}



export async function getUserManagementForAdmin(
  user: CurrentUser,
  filters: UserManagementFilters,
) {
  if (!hasRole(user, "ADMIN")) {
    return { canManage: false as const };
  }

  const [allUsers, domains] = await Promise.all([loadAllUsers(), getDomainOptions()]);
  const filteredUsers = sortUsers(allUsers).filter((entry) =>
    matchesUserFilters(entry, filters),
  );
  const total = filteredUsers.length;
  const skip = (filters.page - 1) * filters.pageSize;
  const users = filteredUsers.slice(skip, skip + filters.pageSize);
  const metrics = await getUserMetrics(allUsers);

  return {
    canManage: true as const,
    domains,
    filters,
    metrics,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    users,
  };
}

export async function createUserForAdmin(
  user: CurrentUser,
  input: UpsertManagedUserInput,
) {
  ensureAdmin(user);
  validateManagedUserInput(input);

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    throw new WorkflowError("Email already exists in the system.");
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const createdUser = await db.user.create({
    data: {
      email,
      isActive: true,
      name,
      organizationLevel: input.role === "USER" ? input.organizationLevel : null,
      organizationTag: input.role === "USER" ? input.organizationTag : null,
      passwordHash,
      projectTag: null,
      stockControllerTag: input.role === "STOCK_CONTROLLER" ? input.stockControllerTag : null,
    },
    select: { id: true },
  });

  await syncRole(createdUser.id, normalizeRoleCode(input.role));
  await syncDomainPermissionsForUser(createdUser.id, input.role);

  return {
    defaultPassword,
    id: createdUser.id,
  };
}

export async function updateUserForAdmin(
  user: CurrentUser,
  userId: string,
  input: Omit<UpsertManagedUserInput, "email">,
) {
  ensureAdmin(user);
  validateManagedUserUpdateInput(input);

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, projectTag: true },
  });

  if (!existing) {
    throw new WorkflowError("User not found.", 404);
  }

  const currentSystemRole = await db.user.findUnique({
    where: { id: userId },
    select: userRowSelect,
  });

  if (!currentSystemRole) {
    throw new WorkflowError("User not found.", 404);
  }

  const previousRole = inferSystemRole(currentSystemRole);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: input.name.trim(),
        organizationLevel: input.role === "USER" ? input.organizationLevel : null,
        organizationTag: input.role === "USER" ? input.organizationTag : null,
        projectTag: input.role === "USER" ? existing.projectTag : null,
        stockControllerTag: input.role === "STOCK_CONTROLLER" ? input.stockControllerTag : null,
      },
    });
  });

  await syncRole(userId, normalizeRoleCode(input.role));

  if (previousRole !== input.role) {
    await syncDomainPermissionsForUser(userId, input.role);
  }
}

export async function deleteUserForAdmin(user: CurrentUser, userId: string) {
  ensureAdmin(user);

  if (user.id === userId) {
    throw new WorkflowError("You cannot delete your own admin account.");
  }

  await db.user.delete({ where: { id: userId } });
}

export async function setUserBlockedStateForAdmin(
  user: CurrentUser,
  userId: string,
  isActive: boolean,
) {
  ensureAdmin(user);

  if (user.id === userId && !isActive) {
    throw new WorkflowError("You cannot block your own admin account.");
  }

  await db.user.update({
    where: { id: userId },
    data: { isActive },
  });
}

export async function assignProjectTagForAdmin(
  user: CurrentUser,
  userId: string,
  projectTag: ProjectTag | null,
) {
  ensureAdmin(user);

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: userRowSelect,
  });

  if (!existing) {
    throw new WorkflowError("User not found.", 404);
  }

  const systemRole = inferSystemRole(existing);
  if (systemRole !== "USER") {
    throw new WorkflowError("Project assignment is available only for User accounts.");
  }

  await db.user.update({
    where: { id: userId },
    data: { projectTag },
  });
}

export async function getUserManagementOptions(user: CurrentUser) {
  ensureAdmin(user);

  return {
    domains: await getDomainOptions(),
  };
}

