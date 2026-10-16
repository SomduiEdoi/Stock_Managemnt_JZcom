import {
  OrganizationLevel,
  OrganizationTag,
  Prisma,
  ProjectTag,
  RoleCode,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { findLdapUserByEmail, LdapDirectoryError } from "@/lib/ldap";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";
import {
  UserStatusFilter,
  UserSystemRole,
  UserManagementFilters,
  UserManagementRow,
  UserManagementMetrics,
  WarehouseOption,
  userRoleOptions,
  organizationLevelOptions,
  organizationUnitOptions,
  projectTagOptions,
  buildUserManagementHref,
} from "./user-management-shared";

export type {
  UserStatusFilter,
  UserSystemRole,
  UserManagementFilters,
  UserManagementRow,
  UserManagementMetrics,
  WarehouseOption,
};

export {
  userRoleOptions,
  organizationLevelOptions,
  organizationUnitOptions,
  projectTagOptions,
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

const userRowSelect = Prisma.validator<Prisma.UserSelect>()({
  email: true,
  id: true,
  isActive: true,
  lastLoginAt: true,
  name: true,
  organizationLevel: true,
  organizationTag: true,
  organizationAssignments: {
    orderBy: [{ isPrimary: "desc" }, { organizationTag: "asc" }],
    select: {
      id: true,
      isPrimary: true,
      organizationLevel: true,
      organizationTag: true,
    },
    where: { isActive: true },
  },
  position: true,
  projectTag: true,
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
  warehousePermissions: {
    where: { warehouse: { isActive: true } },
    select: {
      canManage: true,
      canView: true,
      warehouse: {
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
  organizationAssignments?: Array<{
    organizationLevel: OrganizationLevel;
    organizationTag: OrganizationTag;
  }>;
  primaryOrganizationTag?: OrganizationTag | null;
  organizationTag?: OrganizationTag | null;
  role: UserSystemRole;
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
    roleCodes.includes("STOREMAN") ||    user.warehousePermissions.some((permission) => permission.canManage)
  ) {
    return "STOREMAN";
  }

  return "USER";
}

function toRow(user: UserRecord): UserManagementRow {
  return {
    warehousePermissions: user.warehousePermissions,
    email: user.email,
    id: user.id,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    organizationLevel: user.organizationLevel,
    organizationTag: user.organizationTag,
    organizationAssignments: user.organizationAssignments,
    position: user.position,
    projectTag: user.projectTag,
    roleCodes: user.roles.map(({ role }) => role.code),
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
    user.email ?? "",
    user.name,
    user.position ?? "",
    user.systemRole,
    user.organizationLevel ?? "",
    user.organizationTag ?? "",
    ...user.organizationAssignments.map((assignment) => assignment.organizationLevel),
    ...user.organizationAssignments.map((assignment) => assignment.organizationTag),
    user.projectTag ?? "",
    ...user.warehousePermissions.map((permission) => permission.warehouse.name),
    ...user.warehousePermissions.map((permission) => permission.warehouse.code),
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
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: userRowSelect,
  });

  return users.map(toRow);
}

async function getUserMetrics(allUsers: UserManagementRow[]): Promise<UserManagementMetrics> {
  return {
    active: allUsers.filter((user) => user.isActive).length,
    owners: allUsers.filter((user) => user.systemRole === "STOREMAN")
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

export async function verifyEmailAgainstDirectory(user: CurrentUser, value: string) {
  ensureAdmin(user);

  const email = value.trim().toLowerCase();
  if (!email) {
    throw new WorkflowError("Email is required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new WorkflowError("Email must be a valid email address.");
  }

  let directoryUser;
  try {
    directoryUser = await findLdapUserByEmail(email);
  } catch (error) {
    if (error instanceof LdapDirectoryError) {
      throw new WorkflowError(error.message, 503, "AD_UNAVAILABLE");
    }

    throw error;
  }
  if (!directoryUser) {
    throw new WorkflowError(
      "Email was not found in Active Directory.",
      422,
      "AD_ACCOUNT_NOT_FOUND",
    );
  }

  return {
    email: (directoryUser.email ?? email).trim().toLowerCase(),
    name: directoryUser.name,
  };
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

async function getWarehouseOptions() {
  return db.assetWarehouse.findMany({
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

async function syncWarehousePermissionsForUser(
  userId: string,
  systemRole: UserSystemRole,
) {
  const warehouses = await getWarehouseOptions();

  await db.userWarehousePermission.deleteMany({ where: { userId } });

  if (systemRole === "ADMIN") {
    return;
  }

  const permissionRows = warehouses.map((warehouse) => ({
    canManage: false,
    canView: true,
    warehouseId: warehouse.id,
    userId,
  }));

  await db.userWarehousePermission.createMany({ data: permissionRows });
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

  if (input.role === "USER") {
    const assignments = normalizeOrganizationAssignments(input);
    if (assignments.length === 0) {
      throw new WorkflowError("At least one organization assignment is required for User.");
    }
  }
}

function normalizeOrganizationAssignments(
  input: Pick<UpsertManagedUserInput, "organizationAssignments" | "organizationLevel" | "organizationTag">,
) {
  const assignments = input.organizationAssignments?.filter(
    (assignment) => assignment.organizationLevel && assignment.organizationTag,
  );

  if (assignments && assignments.length > 0) {
    const seen = new Set<OrganizationTag>();

    return assignments.filter((assignment) => {
      if (seen.has(assignment.organizationTag)) {
        return false;
      }

      seen.add(assignment.organizationTag);
      return true;
    });
  }

  if (input.organizationLevel && input.organizationTag) {
    return [
      {
        organizationLevel: input.organizationLevel,
        organizationTag: input.organizationTag,
      },
    ];
  }

  return [];
}

function resolvePrimaryOrganizationAssignment(
  assignments: Array<{ organizationLevel: OrganizationLevel; organizationTag: OrganizationTag }>,
  primaryOrganizationTag?: OrganizationTag | null,
) {
  return (
    assignments.find((assignment) => assignment.organizationTag === primaryOrganizationTag) ??
    assignments[0] ??
    null
  );
}

async function syncOrganizationAssignmentsForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  input: Omit<UpsertManagedUserInput, "email"> | UpsertManagedUserInput,
) {
  const assignments = input.role === "USER" ? normalizeOrganizationAssignments(input) : [];
  const primaryAssignment = resolvePrimaryOrganizationAssignment(
    assignments,
    input.primaryOrganizationTag,
  );

  await tx.userOrganizationAssignment.deleteMany({ where: { userId } });

  if (assignments.length > 0) {
    await tx.userOrganizationAssignment.createMany({
      data: assignments.map((assignment) => ({
        isPrimary: assignment.organizationTag === primaryAssignment?.organizationTag,
        organizationLevel: assignment.organizationLevel,
        organizationTag: assignment.organizationTag,
        userId,
      })),
    });
  }

  await tx.user.update({
    data: {
      organizationLevel: primaryAssignment?.organizationLevel ?? null,
      organizationTag: primaryAssignment?.organizationTag ?? null,
    },
    where: { id: userId },
  });
}

function normalizeRoleCode(systemRole: UserSystemRole): RoleCode {
  if (systemRole === "ADMIN") {
    return "ADMIN";
  }

  if (systemRole === "STOREMAN") {
    return "STOREMAN";
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

  const [allUsers, warehouses] = await Promise.all([loadAllUsers(), getWarehouseOptions()]);
  const filteredUsers = sortUsers(allUsers).filter((entry) =>
    matchesUserFilters(entry, filters),
  );
  const total = filteredUsers.length;
  const skip = (filters.page - 1) * filters.pageSize;
  const users = filteredUsers.slice(skip, skip + filters.pageSize);
  const metrics = await getUserMetrics(allUsers);

  return {
    canManage: true as const,
    warehouses,
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

  const email = (await verifyEmailAgainstDirectory(user, input.email)).email;
  const name = input.name.trim();
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    throw new WorkflowError("Email already exists in the system.");
  }

  const createdUser = await db.$transaction(async (tx) => {
    const nextUser = await tx.user.create({
      data: {
        email,
        isActive: true,
        name,
        passwordHash: null,
        projectTag: null,
      },
      select: { id: true },
    });

    await syncOrganizationAssignmentsForUser(tx, nextUser.id, input);

    return nextUser;
  });

  await syncRole(createdUser.id, normalizeRoleCode(input.role));
  await syncWarehousePermissionsForUser(createdUser.id, input.role);

  return {
    id: createdUser.id,
  };
}

export async function updateUserForAdmin(
  user: CurrentUser,
  userId: string,
  input: UpsertManagedUserInput,
) {
  ensureAdmin(user);
  validateManagedUserInput(input);

  const email = (await verifyEmailAgainstDirectory(user, input.email)).email;

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, projectTag: true },
  });

  if (!existing) {
    throw new WorkflowError("User not found.", 404);
  }

  const conflictingUser = await db.user.findFirst({
    where: { email, id: { not: userId } },
    select: { id: true },
  });

  if (conflictingUser) {
    throw new WorkflowError("Email is already registered to another user.", 409);
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
        email,
        name: input.name.trim(),
        projectTag: input.role === "USER" ? existing.projectTag : null,
      },
    });
    await syncOrganizationAssignmentsForUser(tx, userId, input);
  });

  await syncRole(userId, normalizeRoleCode(input.role));

  if (previousRole !== input.role) {
    await syncWarehousePermissionsForUser(userId, input.role);
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
    warehouses: await getWarehouseOptions(),
  };
}


