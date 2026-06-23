import { AssetStatus, Prisma, TransactionType } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const transactionLogScopes = ["ALL", "IN_PROGRESS", "COMPLETED"] as const;
export type TransactionLogScope = (typeof transactionLogScopes)[number];

export const transactionLogStatusOptions = [
  "ALL",
  AssetStatus.BORROW,
  AssetStatus.USING,
  AssetStatus.SOLD,
  AssetStatus.READY,
  AssetStatus.FAIL,
  AssetStatus.LOST,
  AssetStatus.NEED_CHECK,
] as const;
export type TransactionLogStatusFilter = AssetStatus | "ALL";

export const transactionLogStatusChoices = [
  AssetStatus.BORROW,
  AssetStatus.USING,
  AssetStatus.SOLD,
  AssetStatus.READY,
  AssetStatus.FAIL,
  AssetStatus.LOST,
  AssetStatus.NEED_CHECK,
] as const satisfies readonly AssetStatus[];

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

const transactionLogSelect = Prisma.validator<Prisma.TransactionItemSelect>()({
  asset: {
    select: {
      domain: { select: { code: true } },
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
  resolvedStatus: true,
  resolutionNote: true,
  returnedAt: true,
  transaction: {
    select: {
      createdAt: true,
      dueDate: true,
      id: true,
      requestedBy: { select: { email: true, name: true } },
      transactionNo: true,
      type: true,
    },
  },
  toStatus: true,
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

function isTransactionStatus(value: string | undefined): value is AssetStatus {
  return (transactionLogStatusOptions as readonly string[]).includes(value ?? "");
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

  if (filters.status !== "ALL") {
    clauses.push({
      OR: [
        { resolvedStatus: filters.status },
        {
          AND: [
            { resolvedStatus: null },
            { toStatus: filters.status },
          ],
        },
      ],
    });
  }

  if (filters.type !== "ALL") {
    clauses.push({ transaction: { is: { type: filters.type } } });
  }

  return clauses;
}

function buildVisibleLogWhere(
  filters: Pick<TransactionLogFilters, "scope" | "search" | "status" | "type">,
) {
  const clauses = [...buildStatusWhere(filters)];
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

async function getTransactionLogMetrics() {
  const requestWhere = {
    isActive: true,
    requestLockedById: { not: null },
    status: AssetStatus.REQUEST,
  } satisfies Prisma.AssetWhereInput;

  const [submittedRequests, requestCount] = await Promise.all([
    db.transaction.count(),
    db.asset.count({ where: requestWhere }),
  ]);

  return {
    allRequests: submittedRequests + requestCount,
    completed: submittedRequests,
    inProgress: requestCount,
  };
}

export async function getTransactionLogForUser(
  _user: CurrentUser,
  filters: TransactionLogFilters,
) {
  const where = buildVisibleLogWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;
  const shouldShowSubmittedRows = filters.scope !== "IN_PROGRESS";
  const [metrics, rows, total] = await Promise.all([
    getTransactionLogMetrics(),
    shouldShowSubmittedRows
      ? db.transactionItem.findMany({
          orderBy: [
            { transaction: { createdAt: "desc" } },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          select: transactionLogSelect,
          skip,
          take: filters.pageSize,
          where,
        })
      : Promise.resolve([]),
    shouldShowSubmittedRows ? db.transactionItem.count({ where }) : Promise.resolve(0),
  ]);

  return {
    canView: true,
    filters,
    metrics,
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}
