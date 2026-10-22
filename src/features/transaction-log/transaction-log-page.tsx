import type { ComponentType, ReactNode } from "react";
import { formatProjectLabel } from "@/lib/project-label";
import Link from "next/link";
import { BadgeCheck, Clock3, FileText } from "lucide-react";
import { AssetStatus, TransactionWorkflowStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { requireCurrentUser } from "@/lib/auth";
import {
  buildTransactionLogHref,
  type TransactionLogFilters,
  type TransactionLogRow,
  getPendingApprovalsForUser,
  getTransactionLogForUser,
  normalizeTransactionLogFilters,
  transactionLogStatusChoices,
  type TransactionApprovalQueueRow,
} from "@/lib/transaction-log";
import {
  getRequestQueueForLog,
  type RequestCartAsset,
} from "@/lib/request-cart";
import { assetStatusHexColors } from "@/lib/status-style";
import { hasRole } from "@/lib/permissions";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import { InventoryDataUnavailable } from "@/components/inventory/inventory-data-unavailable";
import { TransactionLogControls } from "@/features/transaction-log/transaction-log-controls";
import { TransactionRowActions } from "@/features/transaction-log/transaction-row-actions";
import { TablePagination } from "@/components/table/table-pagination";
import { db } from "@/lib/db";

export type LogOutcomeQuantity = {
  transactionItemId: string;
  quantity: number;
  approvedAt: Date | null;
};

type TransactionLogDisplayRow = TransactionLogRow & {
  quantityOutcomes?: LogOutcomeQuantity[];
};

type TransactionLogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type MetricCardProps = {
  active?: boolean;
  detail: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: "completed" | "progress" | "total";
  value: number;
};

const scopeLabels = {
  ALL: "All Request",
  COMPLETED: "Completed",
  IN_PROGRESS: "In Progress",
} as const;

const scopeDetails = {
  ALL: "Submitted plus request queue",
  COMPLETED: "Finished transactions",
  IN_PROGRESS: "Request queue",
} as const;

type TransactionLogTab = "approve" | "log";

function normalizeTab(value: string | string[] | undefined): TransactionLogTab {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "approve" ? "approve" : "log";
}

function TabNav({
  activeTab,
  approvalCount,
}: {
  activeTab: TransactionLogTab;
  approvalCount: number;
}) {
  const tabs = [
    { href: "/logs", label: "Log", value: "log" },
    { href: "/logs?tab=approve", label: "Approve", value: "approve" },
  ] as const;

  return (
    <nav
      aria-label="Transaction log tabs"
      className="inline-flex rounded-sm bg-surface p-1"
    >
      {tabs.map((tab) => (
        <Link
          className={[
            "inline-flex h-11 min-w-32 items-center justify-center rounded-full px-5 text-lg font-semibold transition",
            activeTab === tab.value
              ? "bg-brand-accent text-white"
              : "text-ink hover:bg-white",
          ].join(" ")}
          href={tab.href}
          key={tab.value}
        >
          {tab.label}
          {tab.value === "approve" && approvalCount > 0 ? (
            <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-status-fail px-2 py-0.5 text-xs text-white">
              {approvalCount}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(value);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MetricCard({
  active,
  detail,
  href,
  icon: Icon,
  label,
  tone,
  value,
}: MetricCardProps) {
  const toneClasses = {
    completed: "text-status-ready",
    progress: "text-status-request",
    total: "text-brand-accent",
  };

  const card = (
    <article
      className={[
        "h-full rounded-md border bg-white p-5 shadow-sm transition",
        active ? "border-navy ring-1 ring-navy" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-4 text-3xl font-bold leading-none text-ink">
            {formatNumber(value)}
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-navy">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className={`mt-4 text-xs font-semibold ${toneClasses[tone]}`}>
        {detail}
      </p>
    </article>
  );

  return href ? (
    <Link aria-current={active ? "page" : undefined} href={href}>
      {card}
    </Link>
  ) : (
    card
  );
}

function SummaryCards({
  filters,
  metrics,
}: {
  filters: TransactionLogFilters;
  metrics: {
    allRequests: number;
    completed: number;
    inProgress: number;
  };
}) {
  const cards = [
    {
      active: filters.scope === "ALL",
      detail: scopeDetails.ALL,
      href: buildTransactionLogHref(filters, { page: 1, scope: "ALL" }),
      icon: FileText,
      label: scopeLabels.ALL,
      tone: "total" as const,
      value: metrics.allRequests,
    },
    {
      active: filters.scope === "IN_PROGRESS",
      detail: scopeDetails.IN_PROGRESS,
      href: buildTransactionLogHref(filters, { page: 1, scope: "IN_PROGRESS" }),
      icon: Clock3,
      label: scopeLabels.IN_PROGRESS,
      tone: "progress" as const,
      value: metrics.inProgress,
    },
    {
      active: filters.scope === "COMPLETED",
      detail: scopeDetails.COMPLETED,
      href: buildTransactionLogHref(filters, { page: 1, scope: "COMPLETED" }),
      icon: BadgeCheck,
      label: scopeLabels.COMPLETED,
      tone: "completed" as const,
      value: metrics.completed,
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </section>
  );
}

function Controls({
  filters,
  rows,
}: {
  filters: TransactionLogFilters;
  rows: TransactionLogRow[];
}) {
  return (
    <TransactionLogControls
      filters={filters}
      rows={rows}
      statusChoices={[...transactionLogStatusChoices]}
      statusLabels={logStatusLabels}
    />
  );
}

function BorrowerCell({ row }: { row: TransactionLogRow }) {
  const borrower = row.requestedBy;

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-xs font-bold text-white">
        {getInitials(personName(borrower))}
      </span>
      <div>
        <p className="font-semibold text-ink">{personName(borrower)}</p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {borrower?.email ?? "-"}
        </p>
      </div>
    </div>
  );
}

function TransactionLink({
  children,
  transactionId,
}: {
  children: ReactNode;
  transactionId: string;
}) {
  return (
    <Link
      className="block rounded-sm focus:outline-none focus:ring-4 focus:ring-brand-accent/20"
      href={`/logs/${transactionId}/return`}
    >
      {children}
    </Link>
  );
}

function formatRequestTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatReturnDate(row: TransactionLogDisplayRow) {
  const itemDates = row.items
    .map((item) => item.returnedAt)
    .filter((value): value is Date => Boolean(value));
  const latestItemReturn = itemDates.sort(
    (left, right) => right.getTime() - left.getTime(),
  )[0];
  const allItemsResolved = hasFullyPostedItems(row);
  const postedDates = (row.quantityOutcomes ?? []).flatMap((outcome) =>
    outcome.approvedAt ? [outcome.approvedAt] : [],
  );
  const latestPosted = postedDates.sort(
    (left, right) => right.getTime() - left.getTime(),
  )[0];
  const hasResolvedOutcome =
    Boolean(latestPosted) ||
    row.outcomeRecords.some((outcome) => Boolean(outcome.approvedAt));

  if (
    row.type !== "SOLD" &&
    !allItemsResolved &&
    (row.returnedAt ||
      latestItemReturn ||
      hasResolvedOutcome ||
      row.workflowStatus === TransactionWorkflowStatus.IN_PROGRESS ||
      row.workflowStatus === TransactionWorkflowStatus.COMPLETED)
  ) {
    return "Continues";
  }

  const completedDate = latestPosted ?? row.returnedAt ?? latestItemReturn;
  return completedDate ? formatDate(completedDate) : "-";
}

export function hasFullyPostedItems(row: TransactionLogDisplayRow) {
  return (
    row.items.length > 0 &&
    row.items.every((item) => {
      const outcomes = (row.quantityOutcomes ?? []).filter(
        (outcome) => outcome.transactionItemId === item.id,
      );
      if (outcomes.length > 0) {
        const posted = outcomes.reduce(
          (sum, outcome) => sum + (outcome.approvedAt ? outcome.quantity : 0),
          0,
        );
        return posted >= item.requestedQuantity;
      }
      // Legacy records have no structured outcomes; their final return timestamp remains valid.
      return Boolean(item.returnedAt);
    })
  );
}

function personName(
  person: { email: string | null; name: string } | null | undefined,
) {
  if (!person) {
    return "-";
  }

  return person.name || person.email || "-";
}

function RequestQueueTable({ assets }: { assets: RequestCartAsset[] }) {
  if (assets.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-bold text-navy">Request Queue</h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Assets currently held for request before submission.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-bold">Asset</th>
              <th className="px-5 py-4 font-bold">Requester</th>
              <th className="px-5 py-4 font-bold">Locked At</th>
              <th className="px-5 py-4 font-bold">Qty</th>
              <th className="px-5 py-4 font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assets.map((asset) => (
              <tr className="align-middle" key={asset.id}>
                <td className="px-5 py-4">
                  <Link
                    className="font-bold text-navy transition hover:text-brand-accent"
                    href={`/dashboard/assets/${asset.id}`}
                  >
                    {asset.assetModel.name}
                  </Link>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {asset.assetModel.brand ?? "-"} / SN {asset.serialNo ?? "-"}
                  </p>
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {personName(asset.requestLockedBy)}
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {formatRequestTime(
                    asset.requestLockedAt?.toISOString() ?? null,
                  )}
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  {asset.requestedQuantity.toLocaleString("en-US")}
                </td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-status-request/15 px-2.5 py-1 text-xs font-bold uppercase text-status-request">
                    Request
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type LogDisplayType = "BORROW" | "USING" | "SOLD" | "SOLD_FROM_RETURN";
type LogDisplayStatus =
  | "PENDING"
  | "BORROW"
  | "USING"
  | "SOLD"
  | "COMPLETED"
  | "REJECTED";

const logTypeLabels = {
  BORROW: "Borrow",
  USING: "Using",
  SOLD: "Sold",
  SOLD_FROM_RETURN: "Sold from Return",
} as const satisfies Record<LogDisplayType, string>;

const logStatusLabels = {
  PENDING: "Pending",
  BORROW: "Borrow",
  USING: "Using",
  SOLD: "Sold",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
} as const satisfies Record<LogDisplayStatus, string>;

const logStatusColors = {
  PENDING: assetStatusHexColors[AssetStatus.REQUEST],
  BORROW: assetStatusHexColors[AssetStatus.BORROW],
  USING: assetStatusHexColors[AssetStatus.USING],
  SOLD: assetStatusHexColors[AssetStatus.SOLD],
  COMPLETED: "#16A34A",
  REJECTED: assetStatusHexColors[AssetStatus.FAIL],
} as const satisfies Record<LogDisplayStatus, string>;

function getTransactionDisplayNo(row: TransactionLogRow) {
  if (row.type === "SOLD" && row.sourceTransactionId && !row.transactionNo) {
    return `From ${row.sourceTransaction?.transactionNo ?? row.sourceTransaction?.documentRef ?? row.sourceTransactionId}`;
  }

  return row.transactionNo ?? row.id;
}

function getLogDisplayType(row: TransactionLogRow): LogDisplayType {
  return row.type === "SOLD" && row.sourceTransactionId
    ? "SOLD_FROM_RETURN"
    : row.type;
}

export function getLogRequestCategory(row: TransactionLogRow): string | null {
  const request = row.sourceTransaction ?? row;
  if (request.projectRequest || request.project) return "Project";
  if (request.serviceRequest) return "Service";
  if (request.internalRequest) return "Internal";
  return null;
}

export function getLogDisplayStatus(
  row: TransactionLogDisplayRow,
): LogDisplayStatus {
  if (row.workflowStatus === TransactionWorkflowStatus.REJECTED) {
    return "REJECTED";
  }

  if (row.workflowStatus === TransactionWorkflowStatus.PENDING) {
    return "PENDING";
  }

  const allItemsReturned = hasFullyPostedItems(row);

  // The workflow badge describes completion, while TYPE preserves the original
  // request purpose (Borrow, Using, Sold, or Sold from Return).
  if (
    row.workflowStatus === TransactionWorkflowStatus.COMPLETED &&
    (row.type === "SOLD" || allItemsReturned)
  ) {
    return "COMPLETED";
  }

  return row.type as LogDisplayStatus;
}

function ReturnDateLabel({ row }: { row: TransactionLogDisplayRow }) {
  const label = formatReturnDate(row);

  return label === "Continues" ? (
    <span className="inline-flex min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-[#8c898c] px-4 py-1.5 text-xs font-bold text-white">
      {label}
    </span>
  ) : label;
}

function LogStatusBadge({ status }: { status: LogDisplayStatus }) {
  return (
    <span
      className="inline-flex min-w-[96px] items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold text-white shadow-sm"
      style={{ backgroundColor: logStatusColors[status] }}
    >
      {logStatusLabels[status]}
    </span>
  );
}

export function approvalAssetSummary(row: TransactionApprovalQueueRow) {
  const firstItem = row.transaction.items[0];

  if (!firstItem) {
    return "-";
  }

  const model = firstItem.asset?.assetModel.name ?? "Unallocated item";
  const serial = firstItem.asset?.serialNo ?? firstItem.asset?.stockCode ?? "-";
  const suffix =
    row.transaction.items.length > 1
      ? " +" + (row.transaction.items.length - 1) + " more"
      : "";

  return model + " (" + serial + ")" + suffix;
}

function approvalStepLabel(row: TransactionApprovalQueueRow) {
  if (row.user?.name) return row.user.name;

  if (row.requiredTag === "LEAD_PROJECT" && row.transaction.project) {
    const names = [
      ...(row.transaction.project.leadUser
        ? [row.transaction.project.leadUser.name]
        : []),
      ...row.transaction.project.members.map((member) => member.user.name),
    ];
    if (names.length > 0) return names.join(", ");
  }
  return "Unassigned";
}

function ApproveTable({ rows }: { rows: TransactionApprovalQueueRow[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-xl font-bold text-navy">Approval Queue</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-bold">Requisition No.</th>
              <th className="px-5 py-4 font-bold">Requester</th>
              <th className="px-5 py-4 font-bold">Asset</th>
              <th className="px-5 py-4 font-bold">Request Date</th>
              <th className="px-5 py-4 font-bold">Step</th>
              <th className="px-5 py-4 font-bold">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                className="align-middle transition hover:bg-surface/60"
                key={row.id}
              >
                <td className="px-5 py-4 font-bold text-navy">
                  {row.returnRound?.requestNo ?? (row.transaction.sourceTransactionId
                    ? `From ${row.transaction.sourceTransaction?.transactionNo ?? row.transaction.sourceTransactionId}`
                    : row.transaction.transactionNo ?? row.transaction.id)}
                  {row.returnRound ? <p className="mt-1 text-xs font-medium text-muted-foreground">From {row.transaction.transactionNo ?? row.transaction.id}</p> : null}
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  {personName(row.transaction.requestedBy)}
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {row.transaction.requestedBy?.email ?? "-"}
                  </p>
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {approvalAssetSummary(row)}
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {formatDate(row.returnRound?.createdAt ?? row.transaction.requestDate)}
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  {row.requiredTag === "BSD_HELP_DESK" && row.transaction.type === "SOLD"
                    ? "Sale pricing"
                    : row.requiredTag.startsWith("ACK_") ? "Acknowledgement" : `Step ${row.stepSequence}`}
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {approvalStepLabel(row)}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <Link
                    className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 text-sm font-bold text-white hover:bg-black"
                    href={`/logs/${row.transaction.id}/return${row.requiredTag === "BSD_HELP_DESK" && row.transaction.type === "SOLD" ? "#sale-pricing" : ""}`}
                  >
                    {row.requiredTag === "BSD_HELP_DESK" && row.transaction.type === "SOLD" ? "Enter prices" : "View Detail"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
          No approvals waiting for you.
        </div>
      ) : null}
    </section>
  );
}

function transactionQuantity(row: TransactionLogRow) {
  return row.items.reduce(
    (sum, item) => sum + (item.requestedQuantity ?? 1),
    0,
  );
}

function TransactionTable({
  canExportAnytime,
  currentUserId,
  rows,
}: {
  canExportAnytime: boolean;
  currentUserId: string;
  rows: TransactionLogDisplayRow[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-xl font-bold text-navy">Transaction History</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-bold">Transaction ID</th>
              <th className="px-5 py-4 font-bold">Borrower</th>
              <th className="px-5 py-4 font-bold">Project / Customer</th>
              <th className="px-5 py-4 font-bold">Type</th>
              <th className="px-5 py-4 font-bold">Request Date</th>
              <th className="px-5 py-4 font-bold">Return Date</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                className="align-middle transition hover:bg-surface/60"
                key={row.id}
              >
                <td className="px-5 py-4 font-bold text-navy">
                  <TransactionLink transactionId={row.id}>
                    {getTransactionDisplayNo(row)}
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {row.items.length.toLocaleString("en-US")} lines /{" "}
                      {transactionQuantity(row).toLocaleString("en-US")} qty
                    </p>
                  </TransactionLink>
                </td>
                <td className="px-5 py-4">
                  <TransactionLink transactionId={row.id}>
                    <BorrowerCell row={row} />
                  </TransactionLink>
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  <TransactionLink transactionId={row.id}>
                    {(row.project ?? row.sourceTransaction?.project) ? (
                      <>
                        <p>{formatProjectLabel(row.project ?? row.sourceTransaction?.project)}</p>
                      </>
                    ) : (row.serviceRequest ? row.purpose : row.sourceTransaction?.serviceRequest ? row.sourceTransaction.purpose : null) || "-"}
                  </TransactionLink>
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  <TransactionLink transactionId={row.id}>
                    {logTypeLabels[getLogDisplayType(row)]}
                    {getLogDisplayType(row) !== "SOLD_FROM_RETURN" && getLogRequestCategory(row)
                      ? ` / ${getLogRequestCategory(row)}`
                      : ""}
                  </TransactionLink>
                </td>

                <td className="px-5 py-4 font-medium text-ink">
                  <TransactionLink transactionId={row.id}>
                    {formatDate(row.requestDate)}
                  </TransactionLink>
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  <TransactionLink transactionId={row.id}>
                    <ReturnDateLabel row={row} />
                  </TransactionLink>
                </td>
                <td className="px-5 py-4">
                  <TransactionLink transactionId={row.id}>
                    <LogStatusBadge status={getLogDisplayStatus(row)} />
                  </TransactionLink>
                </td>
                <td className="px-5 py-4">
                  <TransactionRowActions
                    canExport={
                      canExportAnytime ||
                      row.workflowStatus !== TransactionWorkflowStatus.PENDING
                    }
                    canCancel={
                      row.requestedBy.id === currentUserId &&
                      !row.sourceTransactionId &&
                      !row.outcomeRecords.some(
                        (outcome) => !outcome.approvedAt,
                      ) &&
                      (row.workflowStatus ===
                        TransactionWorkflowStatus.PENDING ||
                        row.workflowStatus ===
                          TransactionWorkflowStatus.REJECTED)
                    }
                    transactionId={row.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
          No transaction logs found.
        </div>
      ) : null}
    </section>
  );
}

function Pagination({
  filters,
  page,
  total,
  totalPages,
}: {
  filters: TransactionLogFilters;
  page: number;
  total: number;
  totalPages: number;
}) {
  return (
    <TablePagination
      currentPage={page}
      hrefForPage={(nextPage) =>
        buildTransactionLogHref(filters, { page: nextPage })
      }
      summary={`Showing ${formatNumber(Math.min(total, page * filters.pageSize))} of ${formatNumber(total)} entries`}
      totalPages={totalPages}
    />
  );
}
function NoLogAccess() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-bold text-navy">No log access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account does not have permission to view transaction logs.
      </p>
    </section>
  );
}

export function TransactionLogPage({
  activeTab,
  approvalRows,
  canExportAnytime,
  currentUserId,
  filters,
  requestQueueAssets,
  total,
  totalPages,
  rows,
  metrics,
}: {
  activeTab: TransactionLogTab;
  approvalRows: TransactionApprovalQueueRow[];
  canExportAnytime: boolean;
  currentUserId: string;
  filters: TransactionLogFilters;
  metrics: {
    allRequests: number;
    completed: number;
    inProgress: number;
  };
  requestQueueAssets: RequestCartAsset[];
  rows: TransactionLogDisplayRow[];
  total: number;
  totalPages: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TabNav activeTab={activeTab} approvalCount={approvalRows.length} />
      <SummaryCards filters={filters} metrics={metrics} />
      {activeTab === "approve" ? (
        <ApproveTable rows={approvalRows} />
      ) : (
        <>
          {filters.scope !== "COMPLETED" ? (
            <RequestQueueTable assets={requestQueueAssets} />
          ) : null}
          <Controls filters={filters} rows={rows} />
          <TransactionTable
            canExportAnytime={canExportAnytime}
            currentUserId={currentUserId}
            rows={rows}
          />
          <Pagination
            filters={filters}
            page={filters.page}
            total={total}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  );
}

export function TransactionLogForbidden() {
  return <NoLogAccess />;
}

export default async function TransactionLogPageRoute({
  searchParams,
}: TransactionLogPageProps) {
  const rawSearchParams = await searchParams;
  const filters = normalizeTransactionLogFilters(rawSearchParams);
  const activeTab = normalizeTab(rawSearchParams.tab);
  let result: Awaited<ReturnType<typeof getTransactionLogForUser>>;
  let requestQueueAssets: RequestCartAsset[] = [];
  let approvalRows: TransactionApprovalQueueRow[] = [];
  let user: CurrentUser | null = null;
  let quantityOutcomes: Array<
    LogOutcomeQuantity & { transactionItem: { transactionId: string } }
  > = [];

  try {
    user = await requireCurrentUser("/logs");
    const [logResult, queueResult, approvalsResult] = await Promise.all([
      getTransactionLogForUser(user, filters),
      getRequestQueueForLog(),
      getPendingApprovalsForUser(user),
    ]);
    result = logResult;
    if (result.canView && result.rows.length > 0) {
      quantityOutcomes = await db.transactionItemOutcome.findMany({
        where: {
          transactionItem: {
            transactionId: { in: result.rows.map((row) => row.id) },
          },
        },
        select: {
          transactionItemId: true,
          quantity: true,
          approvedAt: true,
          transactionItem: { select: { transactionId: true } },
        },
      });
    }
    requestQueueAssets = queueResult.assets as RequestCartAsset[];
    approvalRows = approvalsResult;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <InventoryDataUnavailable
          warehouseLabel="Transaction log"
          retryHref="/logs"
        />
      );
    }

    throw error;
  }

  if (!result.canView) {
    return <NoLogAccess />;
  }

  if (!user) {
    return <NoLogAccess />;
  }

  return (
    <TransactionLogPage
      activeTab={activeTab}
      approvalRows={approvalRows}
      canExportAnytime={
        hasRole(user, "ADMIN") ||
        hasRole(user, "STOREMAN") ||
        user.permissions.some((permission) => permission.canManage)
      }
      currentUserId={user.id}
      filters={filters}
      metrics={result.metrics}
      requestQueueAssets={requestQueueAssets}
      rows={result.rows.map((row) => ({
        ...row,
        quantityOutcomes: quantityOutcomes.filter(
          (outcome) => outcome.transactionItem.transactionId === row.id,
        ),
      }))}
      total={result.total}
      totalPages={result.totalPages}
    />
  );
}
