import { Prisma, type RoleCode } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";

export type UserStatusFilter = "ACTIVE" | "ALL" | "BLOCKED";

export type UserManagementFilters = {
  page: number;
  pageSize: number;
  role: RoleCode | "ALL";
  search: string;
  status: UserStatusFilter;
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
  position: true,
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
    select: {
      canManage: true,
      canView: true,
      domain: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  },
});

export type UserManagementRow = Prisma.UserGetPayload<{
  select: typeof userRowSelect;
}>;

export const userRoleOptions = [
  "ADMIN",
  "SERVER_OWNER",
  "NETWORK_OWNER",
  "STAFF",
] as const satisfies readonly RoleCode[];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : defaultFilters.page;
}

function isRoleCode(value: string | undefined): value is RoleCode {
  return userRoleOptions.includes(value as RoleCode);
}

function parseStatus(value: string | undefined): UserStatusFilter {
  if (value === "ACTIVE" || value === "BLOCKED") {
    return value;
  }

  return defaultFilters.status;
}

function containsText(search: string) {
  return {
    contains: search,
    mode: Prisma.QueryMode.insensitive,
  };
}

function buildUserWhere(filters: UserManagementFilters): Prisma.UserWhereInput {
  const clauses: Prisma.UserWhereInput[] = [];

  if (filters.search) {
    const contains = containsText(filters.search);
    const roleCodeClause = isRoleCode(filters.search)
      ? [{ roles: { some: { role: { code: filters.search } } } }]
      : [];

    clauses.push({
      OR: [
        { email: contains },
        { name: contains },
        { position: contains },
        { roles: { some: { role: { name: contains } } } },
        ...roleCodeClause,
      ],
    });
  }

  if (filters.role !== "ALL") {
    clauses.push({ roles: { some: { role: { code: filters.role } } } });
  }

  if (filters.status !== "ALL") {
    clauses.push({ isActive: filters.status === "ACTIVE" });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

async function getUserMetrics() {
  const [total, active, owners, staff] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isActive: true } }),
    db.user.count({
      where: {
        roles: {
          some: { role: { code: { in: ["SERVER_OWNER", "NETWORK_OWNER"] } } },
        },
      },
    }),
    db.user.count({
      where: { roles: { some: { role: { code: "STAFF" } } } },
    }),
  ]);

  return { active, owners, staff, total };
}

export function normalizeUserManagementFilters(
  searchParams: SearchParams,
): UserManagementFilters {
  const role = firstParam(searchParams.role);

  return {
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    role: isRoleCode(role) ? role : defaultFilters.role,
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    status: parseStatus(firstParam(searchParams.status)),
  };
}

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

export async function getUserManagementForAdmin(
  user: CurrentUser,
  filters: UserManagementFilters,
) {
  if (!hasRole(user, "ADMIN")) {
    return { canManage: false as const };
  }

  const where = buildUserWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;
  const [metrics, users, total] = await Promise.all([
    getUserMetrics(),
    db.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: userRowSelect,
      skip,
      take: filters.pageSize,
      where,
    }),
    db.user.count({ where }),
  ]);

  return {
    canManage: true as const,
    filters,
    metrics,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    users,
  };
}
