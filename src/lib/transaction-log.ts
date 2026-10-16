import { ApprovalStatus, AssetStatus, Prisma, ProjectMemberTag, TransactionStatus, TransactionWorkflowStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { approvalMatchesUser } from "@/lib/approval-flow";
import { db } from "@/lib/db";

export const transactionLogScopes = ["ALL", "IN_PROGRESS", "COMPLETED"] as const;
export type TransactionLogScope = (typeof transactionLogScopes)[number];

export const transactionLogStatusOptions = [
  "ALL",
  "BORROW",
  "USING",
  "SOLD",
  "RETURN",
  "REJECTED",
] as const;
export type TransactionLogStatusFilter =
  | "ALL"
  | "BORROW"
  | "USING"
  | "SOLD"
  | "RETURN"
  | "REJECTED";

export const transactionLogStatusChoices = [
  "BORROW",
  "USING",
  "SOLD",
  "RETURN",
  "REJECTED",
] as const;

export type TransactionLogFilters = {
  page: number;
  pageSize: number;
  scope: TransactionLogScope;
  search: string;
  status: TransactionLogStatusFilter;
  warehouse: string;
  project: string;
  requester: string;
  from: string;
  to: string;
  type: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: TransactionLogFilters = {
  page: 1,
  pageSize: 10,
  scope: "ALL",
  search: "",
  status: "ALL",
  warehouse: "",
  project: "",
  requester: "",
  from: "",
  to: "",
  type: "ALL",
};

const transactionLogSelect = Prisma.validator<Prisma.TransactionSelect>()({
  createdAt: true,
  dueDate: true,
  id: true,
  requestDate: true,
  returnedAt: true,
  sourceTransactionId: true,
  purpose: true,
  serviceRequest: true,
  internalRequest: true,
  projectRequest: true,
  sourceTransaction: { select: { documentRef: true, id: true, transactionNo: true, purpose: true, serviceRequest: true, internalRequest: true, projectRequest: true, project: { select: { id: true, name: true, projectId: true, customerName: true } } } },
  requestedBy: { select: { email: true, id: true, name: true } },
  project: { select: { id: true, name: true, projectId: true, customerName: true } },
  status: true,
  transactionNo: true,
  type: true,
  workflowStatus: true,
  outcomeRecords: { select: { approvedAt: true, outcomeStatus: true } },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      requestedQuantity: true,
      resolvedStatus: true,
      returnedAt: true,
      toStatus: true,
      returnedBy: { select: { email: true, name: true } },
      asset: {
        select: {
          warehouse: { select: { code: true } },
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
  resolutionBatchId: true,
  requiredTag: true,
  stepSequence: true,
  status: true,
  transaction: {
    select: {
      createdAt: true,
      id: true,
      requestDate: true,
      requestedBy: { select: { email: true, id: true, name: true } },
      project: {
        select: {
          leadUser: { select: { id: true, name: true } },
          members: {
            where: { projectTag: ProjectMemberTag.LEAD_PROJECT },
            select: { userId: true, user: { select: { name: true } } },
          },
        },
      },
      transactionNo: true,
      sourceTransactionId: true,
      sourceTransaction: { select: { documentRef: true, id: true, transactionNo: true } },
      type: true,
      workflowStatus: true,
      approvals: {
        where: { isCurrent: true },
        orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
        select: { id: true, requiredTag: true, status: true, stepSequence: true, userId: true, resolutionBatchId: true },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          requestedQuantity: true,
          asset: {
            select: {
              serialNo: true,
              stockCode: true,
              warehouse: { select: { code: true } },
              assetModel: { select: { brand: true, name: true } },
            },
          },
        },
      },
    },
  },
  userId: true,
  user: { select: { id: true, name: true, email: true } },
});

export type TransactionApprovalQueueRow = Prisma.TransactionApprovalGetPayload<{
  select: typeof approvalTransactionSelect;
}> & { returnRound?: { requestNo: string; createdAt: Date } };

function isCurrentApprovalStep(approval: TransactionApprovalQueueRow) {
  if (approval.requiredTag.startsWith("ACK_")) return true;
  return !approval.transaction.approvals.some(
    (candidate) =>
      candidate.resolutionBatchId === approval.resolutionBatchId &&
      !candidate.requiredTag.startsWith("ACK_") &&
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

function buildSearchKeywordClause(token: string): Prisma.TransactionWhereInput {
  const contains = containsText(token);
  return {
    OR: [
      { transactionNo: contains },
      { purpose: contains },
      { documentRef: contains },
      { requestedBy: { is: { email: contains } } },
      { requestedBy: { is: { name: contains } } },
      { project: { is: { name: contains } } },
      { project: { is: { projectId: contains } } },
      { project: { is: { customerName: contains } } },
      { sourceTransaction: { is: { project: { is: { name: contains } } } } },
      { sourceTransaction: { is: { project: { is: { projectId: contains } } } } },
      { sourceTransaction: { is: { project: { is: { customerName: contains } } } } },
      { sourceTransaction: { is: { purpose: contains } } },
      { items: { some: { asset: { is: { warehouse: { is: { name: contains } } } } } } },
      { items: { some: { asset: { is: { warehouse: { is: { code: contains } } } } } } },
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

function buildSearchWhere(search: string): Prisma.TransactionWhereInput | undefined {
  const tokens = search.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  return tokens.length > 0
    ? { AND: tokens.slice(0, 8).map(buildSearchKeywordClause) }
    : undefined;
}

function buildStatusWhere(
  filters: Pick<TransactionLogFilters, "scope" | "status">,
) {
  const clauses: Prisma.TransactionWhereInput[] = [];

  if (filters.status === "REJECTED") {
    clauses.push({ workflowStatus: TransactionWorkflowStatus.REJECTED });
  } else if (filters.status === "RETURN") {
    clauses.push({
      items: {
        some: {
          returnedAt: { not: null },
          NOT: { resolvedStatus: AssetStatus.SOLD },
        },
      },
    });
  } else if (filters.status === "SOLD") {
    clauses.push({ type: "SOLD" });
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
  filters: Pick<TransactionLogFilters, "scope" | "search" | "status" | "warehouse" | "project" | "requester" | "from" | "to" | "type">,
) {
  const clauses = [
    { workflowStatus: { not: TransactionWorkflowStatus.CANCELLED } },
    ...buildStatusWhere(filters),
  ];
  const searchWhere = buildSearchWhere(filters.search);

  if (filters.warehouse) {
    clauses.push({ items: { some: { asset: { warehouseId: filters.warehouse } } } });
  }
  if (filters.project) clauses.push({ projectId: filters.project });
  if (filters.requester) clauses.push({ requestedById: filters.requester });
  if (filters.type !== "ALL" && filters.type !== "RETURN") {
    clauses.push({ type: filters.type as Prisma.EnumTransactionTypeFilter });
  }
  if (filters.from || filters.to) {
    clauses.push({ requestDate: { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00`) } : {}), ...(filters.to ? { lt: new Date(`${filters.to}T23:59:59.999`) } : {}) } });
  }

  if (filters.scope === "COMPLETED") {
    clauses.push({
      OR: [
        { workflowStatus: TransactionWorkflowStatus.COMPLETED },
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
    warehouse: firstParam(searchParams.warehouse)?.trim() ?? "",
    project: firstParam(searchParams.project)?.trim() ?? "",
    requester: firstParam(searchParams.requester)?.trim() ?? "",
    from: firstParam(searchParams.from)?.trim() ?? "",
    to: firstParam(searchParams.to)?.trim() ?? "",
    type: firstParam(searchParams.type)?.trim() || "ALL",
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
  for (const [key, value] of [["warehouse", nextFilters.warehouse], ["project", nextFilters.project], ["requester", nextFilters.requester], ["from", nextFilters.from], ["to", nextFilters.to]] as const) {
    if (value) params.set(key, value);
  }
  if (nextFilters.type !== "ALL") params.set("type", nextFilters.type);

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
    transactionItems: {
      none: {
        transaction: {
          workflowStatus: TransactionWorkflowStatus.PENDING,
        },
      },
    },
  } satisfies Prisma.AssetWhereInput;
  const completedWhere = {
    OR: [
      { workflowStatus: TransactionWorkflowStatus.COMPLETED },
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
    db.transaction.count({ where: { workflowStatus: { not: TransactionWorkflowStatus.CANCELLED } } }),
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
  const batches = await db.returnBatch.findMany({
    where: { state: { in: ["SUBMITTED", "COMPLETED"] } },
    select: { id: true, transactionId: true, state: true, requestNo: true, createdAt: true },
  });
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const submittedBatchIds = batches.filter((batch) => batch.state === "SUBMITTED").map((batch) => batch.id);
  const sourceApprovals = await db.transactionApproval.findMany({
    where: { resolutionBatchId: { in: batches.map((batch) => batch.id) }, isCurrent: true },
    select: { transactionId: true, resolutionBatchId: true, requiredTag: true, status: true },
  });
  const approvals = await db.transactionApproval.findMany({
    orderBy: [
      { stepSequence: "asc" },
      { createdAt: "desc" },
    ],
    select: approvalTransactionSelect,
    where: {
      status: ApprovalStatus.PENDING,
      isCurrent: true,
      OR: [
        { resolutionBatchId: { in: submittedBatchIds } },
        { transaction: { workflowStatus: TransactionWorkflowStatus.PENDING } },
        {
          requiredTag: { in: ["ACK_BSD", "ACK_WAREHOUSE_MANAGER"] },
          transaction: { workflowStatus: { not: TransactionWorkflowStatus.PENDING } },
        },
      ],
    },
  });

  const current = approvals.filter((approval) => {
    if (approval.resolutionBatchId) {
      const batch = batchById.get(approval.resolutionBatchId);
      if (!batch) return false;
      const pendingSalePricing = batch.state === "COMPLETED" &&
        batch.transactionId === approval.transaction.sourceTransactionId &&
        approval.transaction.type === "SOLD" &&
        approval.transaction.workflowStatus === TransactionWorkflowStatus.PENDING &&
        approval.requiredTag === "BSD_STAFF";
      if (batch.state !== "SUBMITTED" && !pendingSalePricing) return false;
    }
    if (approval.transaction.sourceTransactionId && !approval.requiredTag.startsWith("ACK_")) {
      const cycle = sourceApprovals.filter((candidate) =>
        candidate.transactionId === approval.transaction.sourceTransactionId &&
        candidate.resolutionBatchId === approval.resolutionBatchId &&
        candidate.requiredTag !== "BSD_STAFF" && !candidate.requiredTag.startsWith("ACK_"));
      if (!cycle.some((candidate) => candidate.requiredTag.startsWith("STOREMAN:")) ||
          !cycle.every((candidate) => candidate.status === ApprovalStatus.APPROVED)) return false;
    }
    if (!isCurrentApprovalStep(approval)) return false;

    if (approval.requiredTag === ProjectMemberTag.LEAD_PROJECT && approval.transaction.project) {
      const leadIds = new Set([
        ...(approval.transaction.project.leadUser ? [approval.transaction.project.leadUser.id] : []),
        ...approval.transaction.project.members.map((member) => member.userId),
      ]);
      return leadIds.has(user.id) && approval.userId === user.id;
    }

    return approvalMatchesUser(user, approval);
  });
  const outcomes = await db.transactionItemOutcome.findMany({
    where: { resolutionBatchId: { in: [...new Set(current.flatMap((approval) => approval.resolutionBatchId ? [approval.resolutionBatchId] : []))] }, approvedAt: null },
    select: { resolutionBatchId: true, transactionItemId: true, quantity: true },
  });
  return current.map((approval): TransactionApprovalQueueRow => {
    const batch = approval.resolutionBatchId ? batchById.get(approval.resolutionBatchId) : undefined;
    if (!batch || approval.transaction.sourceTransactionId) return approval;
    const quantities = new Map<string, number>();
    for (const outcome of outcomes.filter((row) => row.resolutionBatchId === batch.id)) {
      quantities.set(outcome.transactionItemId, (quantities.get(outcome.transactionItemId) ?? 0) + outcome.quantity);
    }
    return { ...approval, returnRound: batch, transaction: { ...approval.transaction,
      items: approval.transaction.items.filter((item) => quantities.has(item.id))
        .map((item) => ({ ...item, requestedQuantity: quantities.get(item.id)! })),
    } };
  });
}
