import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Clock3,
  FileText,
  Search,
} from "lucide-react";
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
import { getRequestQueueForLog, type RequestCartAsset } from "@/lib/request-cart";
import { assetStatusHexColors } from "@/lib/status-style";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import { InventoryDataUnavailable } from "@/components/inventory/inventory-data-unavailable";
import { TransactionRowActions } from "@/features/transaction-log/transaction-row-actions";
import { ApprovalRowActions } from "@/features/transaction-log/approval-row-actions";

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

function TabNav({ activeTab }: { activeTab: TransactionLogTab }) {
  const tabs = [
    { href: "/logs", label: "Log", value: "log" },
    { href: "/logs?tab=approve", label: "Approve", value: "approve" },
  ] as const;

  return (
    <nav aria-label="Transaction log tabs" className="inline-flex rounded-sm bg-surface p-1">
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

function Controls({ filters }: { filters: TransactionLogFilters }) {
  return (
    <form
      action="/logs"
      className="rounded-md border border-border bg-white p-4 shadow-sm"
      method="get"
    >
      <input name="scope" type="hidden" value={filters.scope} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
            defaultValue={filters.search}
            name="q"
            placeholder="Search transaction id, borrower, model, serial no."
          />
        </div>

        <select
          className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
          defaultValue={filters.status}
          name="status"
        >
          <option value="ALL">All status</option>
          {transactionLogStatusChoices.map((status) => (
            <option key={status} value={status}>
              {logStatusLabels[status]}
            </option>
          ))}
        </select>

        <button className="sr-only" type="submit">
          Search
        </button>
      </div>
    </form>
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

function ReturnerCell({ row }: { row: TransactionLogRow }) {
  const names = Array.from(
    new Set(
      row.items
        .map((item) => personName(item.returnedBy))
        .filter((name) => name !== "-"),
    ),
  );

  if (names.length === 0) {
    return <span className="font-medium text-muted-foreground">-</span>;
  }

  return (
    <div>
      <p className="font-semibold text-ink">{names.slice(0, 2).join(", ")}</p>
      {names.length > 2 ? (
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          +{names.length - 2} more
        </p>
      ) : null}
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

function formatReturnDate(row: TransactionLogRow) {
  const itemDates = row.items
    .map((item) => item.returnedAt)
    .filter((value): value is Date => Boolean(value));
  const latestItemReturn = itemDates.sort(
    (left, right) => right.getTime() - left.getTime(),
  )[0];

  return row.returnedAt || latestItemReturn
    ? formatDate(row.returnedAt ?? latestItemReturn)
    : "-";
}

function personName(person: { email: string; name: string } | null | undefined) {
  if (!person) {
    return "-";
  }

  return person.name || person.email || "-";
}

function RequestQueueTable({
  assets,
}: {
  assets: RequestCartAsset[];
}) {
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
                  {formatRequestTime(asset.requestLockedAt?.toISOString() ?? null)}
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

type LogDisplayStatus = "PENDING" | "BORROW" | "USING" | "SOLD" | "RETURN";

const logStatusLabels = {
  PENDING: "Pending",
  BORROW: "Borrow",
  USING: "Using",
  SOLD: "Sold",
  RETURN: "Return",
} as const satisfies Record<LogDisplayStatus, string>;

const logStatusColors = {
  PENDING: assetStatusHexColors[AssetStatus.REQUEST],
  BORROW: assetStatusHexColors[AssetStatus.BORROW],
  USING: assetStatusHexColors[AssetStatus.USING],
  SOLD: assetStatusHexColors[AssetStatus.SOLD],
  RETURN: assetStatusHexColors[AssetStatus.READY],
} as const satisfies Record<LogDisplayStatus, string>;

function getLogDisplayStatus(row: TransactionLogRow): LogDisplayStatus {
  if (row.workflowStatus === TransactionWorkflowStatus.PENDING) {
    return "PENDING";
  }

  const allItemsReturned =
    row.items.length > 0 && row.items.every((item) => Boolean(item.returnedAt));

  if (row.returnedAt || allItemsReturned) {
    return "RETURN";
  }

  return row.type as LogDisplayStatus;
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

function approvalAssetSummary(row: TransactionApprovalQueueRow) {
  const firstItem = row.transaction.items[0];

  if (!firstItem) {
    return "-";
  }

  const model = firstItem.asset.assetModel.name;
  const serial = firstItem.asset.serialNo ?? firstItem.asset.stockCode ?? "-";
  const suffix = row.transaction.items.length > 1
    ? " +" + (row.transaction.items.length - 1) + " more"
    : "";

  return model + " (" + serial + ")" + suffix;
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
              <th className="px-5 py-4 font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr className="align-middle transition hover:bg-surface/60" key={row.id}>
                <td className="px-5 py-4 font-bold text-navy">
                  {row.transaction.transactionNo ?? row.transaction.id}
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
                  {formatDate(row.transaction.requestDate)}
                </td>
                <td className="px-5 py-4 font-semibold text-ink">
                  Step {row.stepSequence}
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {row.requiredTag}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <ApprovalRowActions transactionId={row.transaction.id} />
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
  return row.items.reduce((sum, item) => sum + (item.requestedQuantity ?? 1), 0);
}

function TransactionTable({
  rows,
}: {
  rows: TransactionLogRow[];
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
              <th className="px-5 py-4 font-bold">Returner</th>
              <th className="px-5 py-4 font-bold">Request Date</th>
              <th className="px-5 py-4 font-bold">Return Date</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Action</th>
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
                    {row.transactionNo ?? row.id}
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {row.items.length.toLocaleString("en-US")} lines / {transactionQuantity(row).toLocaleString("en-US")} qty
                    </p>
                  </TransactionLink>
                </td>
                <td className="px-5 py-4">
                  <TransactionLink transactionId={row.id}>
                    <BorrowerCell row={row} />
                  </TransactionLink>
                </td>
                <td className="px-5 py-4">
                  <TransactionLink transactionId={row.id}>
                    <ReturnerCell row={row} />
                  </TransactionLink>
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  <TransactionLink transactionId={row.id}>
                    {formatDate(row.requestDate)}
                  </TransactionLink>
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  <TransactionLink transactionId={row.id}>
                    {formatReturnDate(row)}
                  </TransactionLink>
                </td>
                <td className="px-5 py-4">
                  <TransactionLink transactionId={row.id}>
                    <LogStatusBadge status={getLogDisplayStatus(row)} />
                  </TransactionLink>
                </td>
                <td className="px-5 py-4">
                  <TransactionRowActions transactionId={row.id} />
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
    <footer className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <p>
        Showing {formatNumber(Math.min(total, page * filters.pageSize))} of{" "}
        {formatNumber(total)} entries
      </p>
      <div className="flex gap-2">
        <Link
          aria-disabled={page <= 1}
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={buildTransactionLogHref(filters, { page: Math.max(1, page - 1) })}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Link>
        <Link
          aria-disabled={page >= totalPages}
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-navy px-3 font-semibold text-white aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={buildTransactionLogHref(filters, { page: Math.min(totalPages, page + 1) })}
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </footer>
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
  filters,
  requestQueueAssets,
  total,
  totalPages,
  rows,
  metrics,
}: {
  activeTab: TransactionLogTab;
  approvalRows: TransactionApprovalQueueRow[];
  filters: TransactionLogFilters;
  metrics: {
    allRequests: number;
    completed: number;
    inProgress: number;
  };
  requestQueueAssets: RequestCartAsset[];
  rows: TransactionLogRow[];
  total: number;
  totalPages: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TabNav activeTab={activeTab} />
      <SummaryCards filters={filters} metrics={metrics} />
      {activeTab === "approve" ? (
        <ApproveTable rows={approvalRows} />
      ) : (
        <>
          {filters.scope !== "COMPLETED" ? (
            <RequestQueueTable assets={requestQueueAssets} />
          ) : null}
          <Controls filters={filters} />
          <TransactionTable rows={rows} />
          <Pagination filters={filters} page={filters.page} total={total} totalPages={totalPages} />
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

  try {
    user = await requireCurrentUser("/logs");
    const [logResult, queueResult, approvalsResult] = await Promise.all([
      getTransactionLogForUser(user, filters),
      getRequestQueueForLog(),
      getPendingApprovalsForUser(user),
    ]);
    result = logResult;
    requestQueueAssets = queueResult.assets as RequestCartAsset[];
    approvalRows = approvalsResult;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <InventoryDataUnavailable
          domainLabel="Transaction log"
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
      filters={filters}
      metrics={result.metrics}
      requestQueueAssets={requestQueueAssets}
      rows={result.rows}
      total={result.total}
      totalPages={result.totalPages}
    />
  );
}

