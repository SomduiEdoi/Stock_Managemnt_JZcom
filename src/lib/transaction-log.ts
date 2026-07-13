import { ApprovalStatus, AssetStatus, Prisma, TransactionStatus, TransactionWorkflowStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const transactionLogScopes = ["ALL", "IN_PROGRESS", "COMPLETED"] as const;
export type TransactionLogScope = (typeof transactionLogScopes)[number];

export const transactionLogStatusOptions = [
  "ALL",
  "BORROW",
  "USING",
  "SOLD",
  "RETURN",
] as const;
export type TransactionLogStatusFilter =
  | "ALL"
  | "BORROW"
  | "USING"
  | "SOLD"
  | "RETURN";

export const transactionLogStatusChoices = [
  "BORROW",
  "USING",
  "SOLD",
  "RETURN",
] as const;

export type TransactionLogFilters = {
  page: number;
  pageSize: number;
  scope: TransactionLogScope;
  search: string;
  status: TransactionLogStatusFilter;
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: TransactionLogFilters = {
  page: 1,
  pageSize: 10,
  scope: "ALL",
  search: "",
  status: "ALL",
};

const transactionLogSelect = Prisma.validator<Prisma.TransactionSelect>()({
  createdAt: true,
  dueDate: true,
  id: true,
  requestDate: true,
  returnedAt: true,
  requestedBy: { select: { email: true, name: true } },
  status: true,
  transactionNo: true,
  type: true,
  workflowStatus: true,
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      resolvedStatus: true,
      returnedAt: true,
      toStatus: true,
      returnedBy: { select: { email: true, name: true } },
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
    },
  },
});

export type TransactionLogRow = Prisma.TransactionGetPayload<{
  select: typeof transactionLogSelect;
}>;

const approvalTransactionSelect = Prisma.validator<Prisma.TransactionApprovalSelect>()({
  id: true,
  requiredTag: true,
  stepSequence: true,
  status: true,
  transaction: {
    select: {
      createdAt: true,
      id: true,
      requestDate: true,
      requestedBy: { select: { email: true, name: true } },
      transactionNo: true,
      type: true,
      workflowStatus: true,
      approvals: {
        orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
        select: { id: true, requiredTag: true, status: true, stepSequence: true, userId: true },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          requestedQuantity: true,
          asset: {
            select: {
              serialNo: true,
              stockCode: true,
              domain: { select: { code: true } },
              assetModel: { select: { brand: true, name: true } },
            },
          },
        },
      },
    },
  },
  userId: true,
});

export type TransactionApprovalQueueRow = Prisma.TransactionApprovalGetPayload<{
  select: typeof approvalTransactionSelect;
}>;

function approvalMatchesUser(user: CurrentUser, approval: { requiredTag: string; userId: string | null }) {
  if (approval.userId === user.id) {
    return true;
  }

  if (approval.requiredTag.startsWith("STOCK_CONTROLLER:")) {
    const domainCode = approval.requiredTag.split(":")[1];
    return user.permissions.some(
      (permission) => permission.domainCode === domainCode && permission.canManage,
    );
  }

  return (
    user.organizationTag === approval.requiredTag ||
    user.projectTag === approval.requiredTag
  );
}

function isCurrentApprovalStep(approval: TransactionApprovalQueueRow) {
  return !approval.transaction.approvals.some(
    (candidate) =>
      candidate.stepSequence < approval.stepSequence &&
      candidate.status === ApprovalStatus.PENDING,
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : defaultFilters.page;
}

function isTransactionStatus(
  value: string | undefined,
): value is TransactionLogStatusFilter {
  return (transactionLogStatusOptions as readonly string[]).includes(value ?? "");
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

function buildSearchWhere(search: string): Prisma.TransactionWhereInput | undefined {
  if (!search) {
    return undefined;
  }

  const contains = containsText(search);

  return {
    OR: [
      { transactionNo: contains },
      { purpose: contains },
      { documentRef: contains },
      { requestedBy: { is: { email: contains } } },
      { requestedBy: { is: { name: contains } } },
      { items: { some: { asset: { is: { serialNo: contains } } } } },
      { items: { some: { asset: { is: { stockCode: contains } } } } },
      { items: { some: { asset: { is: { locationText: contains } } } } },
      { items: { some: { asset: { is: { location: { is: { name: contains } } } } } } },
      { items: { some: { asset: { is: { assetModel: { is: { brand: contains } } } } } } },
      { items: { some: { asset: { is: { assetModel: { is: { name: contains } } } } } } },
      { items: { some: { asset: { is: { assetModel: { is: { typeName: contains } } } } } } },
      {
        items: {
          some: {
            asset: {
              is: {
                assetModel: {
                  is: { category: { is: { name: contains } } },
                },
              },
            },
          },
        },
      },
    ],
  };
}

function buildStatusWhere(
  filters: Pick<TransactionLogFilters, "scope" | "status">,
) {
  const clauses: Prisma.TransactionWhereInput[] = [];

  if (filters.status === "RETURN") {
    clauses.push({
      OR: [
        { status: TransactionStatus.RETURNED },
        { returnedAt: { not: null } },
        { items: { some: { returnedAt: { not: null } } } },
      ],
    });
  } else if (filters.status !== "ALL") {
    clauses.push({
      type: filters.status,
      NOT: {
        OR: [
          { status: TransactionStatus.RETURNED },
          { returnedAt: { not: null } },
        ],
      },
    });
  }

  return clauses;
}

function buildVisibleLogWhere(
  filters: Pick<TransactionLogFilters, "scope" | "search" | "status">,
) {
  const clauses = [...buildStatusWhere(filters)];
  const searchWhere = buildSearchWhere(filters.search);

  if (filters.scope === "COMPLETED") {
    clauses.push({
      OR: [
        { status: TransactionStatus.COMPLETED },
        { status: TransactionStatus.RETURNED },
        { returnedAt: { not: null } },
        {
          AND: [
            { items: { some: {} } },
            { items: { every: { returnedAt: { not: null } } } },
          ],
        },
      ],
    });
  }

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

  return {
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    scope: parseScope(firstParam(searchParams.scope)),
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    status: isTransactionStatus(status) ? status : defaultFilters.status,
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
  const completedWhere = {
    OR: [
      { status: TransactionStatus.COMPLETED },
      { status: TransactionStatus.RETURNED },
      { returnedAt: { not: null } },
      {
        AND: [
          { items: { some: {} } },
          { items: { every: { returnedAt: { not: null } } } },
        ],
      },
    ],
  } satisfies Prisma.TransactionWhereInput;

  const [submittedRequests, pendingTransactions, requestCount, completed] = await Promise.all([
    db.transaction.count(),
    db.transaction.count({ where: { workflowStatus: TransactionWorkflowStatus.PENDING } }),
    db.asset.count({ where: requestWhere }),
    db.transaction.count({ where: completedWhere }),
  ]);

  return {
    allRequests: submittedRequests + requestCount,
    completed,
    inProgress: pendingTransactions + requestCount,
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
      ? db.transaction.findMany({
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          select: transactionLogSelect,
          skip,
          take: filters.pageSize,
          where,
        })
      : Promise.resolve([]),
    shouldShowSubmittedRows ? db.transaction.count({ where }) : Promise.resolve(0),
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

export async function getPendingApprovalsForUser(user: CurrentUser) {
  const approvals = await db.transactionApproval.findMany({
    orderBy: [
      { stepSequence: "asc" },
      { createdAt: "desc" },
    ],
    select: approvalTransactionSelect,
    where: {
      status: ApprovalStatus.PENDING,
      transaction: { workflowStatus: TransactionWorkflowStatus.PENDING },
    },
  });

  return approvals.filter(
    (approval) => approvalMatchesUser(user, approval) && isCurrentApprovalStep(approval),
  );
}
