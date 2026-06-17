import { Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { getVisibleDomainCodes } from "@/lib/assets";
import { db } from "@/lib/db";

export const transactionLogScopes = ["ALL", "IN_PROGRESS", "COMPLETED"] as const;
export type TransactionLogScope = (typeof transactionLogScopes)[number];

export const transactionLogStatusOptions = [
  "ALL",
  TransactionStatus.BORROWED,
  TransactionStatus.RETURNED,
  TransactionStatus.OVERDUE,
  TransactionStatus.ACTIVE,
  TransactionStatus.COMPLETED,
] as const;
export type TransactionLogStatusFilter = TransactionStatus | "ALL";

export const transactionLogStatusChoices = [
  TransactionStatus.BORROWED,
  TransactionStatus.RETURNED,
  TransactionStatus.OVERDUE,
  TransactionStatus.ACTIVE,
  TransactionStatus.COMPLETED,
] as const satisfies readonly TransactionStatus[];

export const transactionLogTypeOptions = [
  "ALL",
  TransactionType.BORROW,
  TransactionType.USING,
  TransactionType.SOLD,
] as const;
export type TransactionLogTypeFilter = TransactionType | "ALL";

export const transactionLogTypeChoices = [
  TransactionType.BORROW,
  TransactionType.USING,
  TransactionType.SOLD,
] as const satisfies readonly TransactionType[];

export type TransactionLogFilters = {
  page: number;
  pageSize: number;
  scope: TransactionLogScope;
  search: string;
  status: TransactionLogStatusFilter;
  type: TransactionLogTypeFilter;
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: TransactionLogFilters = {
  page: 1,
  pageSize: 10,
  scope: "ALL",
  search: "",
  status: "ALL",
  type: "ALL",
};

const inProgressStatuses = [
  TransactionStatus.ACTIVE,
  TransactionStatus.BORROWED,
  TransactionStatus.OVERDUE,
] as const;

const completedStatuses = [
  TransactionStatus.RETURNED,
  TransactionStatus.COMPLETED,
] as const;

const transactionLogSelect = Prisma.validator<Prisma.TransactionItemSelect>()({
  asset: {
    select: {
      id: true,
      location: { select: { name: true } },
      locationText: true,
      serialNo: true,
      status: true,
      stockCode: true,
      assetModel: {
        select: {
          brand: true,
          category: { select: { name: true } },
          name: true,
          typeName: true,
        },
      },
    },
  },
  createdAt: true,
  id: true,
  transaction: {
    select: {
      createdAt: true,
      dueDate: true,
      id: true,
      requestedBy: { select: { email: true, name: true } },
      status: true,
      transactionNo: true,
      type: true,
    },
  },
});

export type TransactionLogRow = Prisma.TransactionItemGetPayload<{
  select: typeof transactionLogSelect;
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : defaultFilters.page;
}

function isTransactionStatus(value: string | undefined): value is TransactionStatus {
  return transactionLogStatusOptions.includes(value as TransactionStatus);
}

function isTransactionType(value: string | undefined): value is TransactionType {
  return transactionLogTypeOptions.includes(value as TransactionType);
}

function isTransactionScope(value: string | undefined): value is TransactionLogScope {
  return transactionLogScopes.includes(value as TransactionLogScope);
}

function containsText(search: string) {
  return {
    contains: search,
    mode: Prisma.QueryMode.insensitive,
  };
}

function buildBaseWhere(user: CurrentUser): Prisma.TransactionItemWhereInput {
  return {
    asset: { is: { domain: { is: { code: { in: getVisibleDomainCodes(user) } } } } },
  };
}

function buildSearchWhere(search: string): Prisma.TransactionItemWhereInput | undefined {
  if (!search) {
    return undefined;
  }

  const contains = containsText(search);

  return {
    OR: [
      { transaction: { is: { transactionNo: contains } } },
      { transaction: { is: { purpose: contains } } },
      { transaction: { is: { documentRef: contains } } },
      { transaction: { is: { requestedBy: { is: { email: contains } } } } },
      { transaction: { is: { requestedBy: { is: { name: contains } } } } },
      { asset: { is: { serialNo: contains } } },
      { asset: { is: { stockCode: contains } } },
      { asset: { is: { locationText: contains } } },
      { asset: { is: { location: { is: { name: contains } } } } },
      { asset: { is: { assetModel: { is: { brand: contains } } } } },
      { asset: { is: { assetModel: { is: { name: contains } } } } },
      { asset: { is: { assetModel: { is: { typeName: contains } } } } },
      {
        asset: {
          is: {
            assetModel: {
              is: { category: { is: { name: contains } } },
            },
          },
        },
      },
    ],
  };
}

function buildStatusWhere(
  filters: Pick<TransactionLogFilters, "scope" | "status" | "type">,
) {
  const clauses: Prisma.TransactionItemWhereInput[] = [];

  if (filters.scope === "IN_PROGRESS") {
    clauses.push({
      transaction: { is: { status: { in: [...inProgressStatuses] } } },
    });
  }

  if (filters.scope === "COMPLETED") {
    clauses.push({
      transaction: { is: { status: { in: [...completedStatuses] } } },
    });
  }

  if (filters.status !== "ALL") {
    clauses.push({ transaction: { is: { status: filters.status } } });
  }

  if (filters.type !== "ALL") {
    clauses.push({ transaction: { is: { type: filters.type } } });
  }

  return clauses;
}

function buildVisibleLogWhere(
  user: CurrentUser,
  filters: Pick<TransactionLogFilters, "scope" | "search" | "status" | "type">,
) {
  const clauses = [buildBaseWhere(user), ...buildStatusWhere(filters)];
  const searchWhere = buildSearchWhere(filters.search);

  if (searchWhere) {
    clauses.push(searchWhere);
  }

  return clauses.length > 1 ? { AND: clauses } : clauses[0];
}

function parseScope(value: string | undefined): TransactionLogScope {
  return isTransactionScope(value) ? value : defaultFilters.scope;
}

export function normalizeTransactionLogFilters(
  searchParams: SearchParams,
): TransactionLogFilters {
  const status = firstParam(searchParams.status);
  const type = firstParam(searchParams.type);

  return {
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    scope: parseScope(firstParam(searchParams.scope)),
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    status: isTransactionStatus(status) ? status : defaultFilters.status,
    type: isTransactionType(type) ? type : defaultFilters.type,
  };
}

export function buildTransactionLogHref(
  filters: TransactionLogFilters,
  overrides: Partial<TransactionLogFilters> = {},
) {
  const nextFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (nextFilters.search) {
    params.set("q", nextFilters.search);
  }

  if (nextFilters.scope !== "ALL") {
    params.set("scope", nextFilters.scope);
  }

  if (nextFilters.status !== "ALL") {
    params.set("status", nextFilters.status);
  }

  if (nextFilters.type !== "ALL") {
    params.set("type", nextFilters.type);
  }

  if (nextFilters.page > 1) {
    params.set("page", String(nextFilters.page));
  }

  return `/logs${params.size ? `?${params.toString()}` : ""}`;
}

async function getTransactionLogMetrics(user: CurrentUser) {
  const baseWhere = buildBaseWhere(user);

  const [allRequests, inProgress, completed] = await Promise.all([
    db.transactionItem.count({ where: baseWhere }),
    db.transactionItem.count({
      where: {
        AND: [
          baseWhere,
          { transaction: { is: { status: { in: [...inProgressStatuses] } } } },
        ],
      },
    }),
    db.transactionItem.count({
      where: {
        AND: [
          baseWhere,
          { transaction: { is: { status: { in: [...completedStatuses] } } } },
        ],
      },
    }),
  ]);

  return { allRequests, completed, inProgress };
}

export async function getTransactionLogForUser(
  user: CurrentUser,
  filters: TransactionLogFilters,
) {
  const where = buildVisibleLogWhere(user, filters);
  const skip = (filters.page - 1) * filters.pageSize;
  const [metrics, rows, total] = await Promise.all([
    getTransactionLogMetrics(user),
    db.transactionItem.findMany({
      orderBy: [
        { transaction: { createdAt: "desc" } },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: transactionLogSelect,
      skip,
      take: filters.pageSize,
      where,
    }),
    db.transactionItem.count({ where }),
  ]);

  return {
    canView: getVisibleDomainCodes(user).length > 0,
    filters,
    metrics,
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}
