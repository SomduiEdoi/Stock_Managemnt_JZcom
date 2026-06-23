import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Clock3,
  FileText,
  Filter,
  Search,
} from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { requireCurrentUser } from "@/lib/auth";
import {
  buildTransactionLogHref,
  type TransactionLogFilters,
  type TransactionLogRow,
  getTransactionLogForUser,
  normalizeTransactionLogFilters,
  transactionLogStatusChoices,
  transactionLogTypeChoices,
} from "@/lib/transaction-log";
import { getRequestQueueForLog, type RequestCartAsset } from "@/lib/request-cart";
import { canViewDomainForUser } from "@/lib/permissions";
import { assetStatusLabels } from "@/lib/status-style";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import { InventoryDataUnavailable } from "@/components/inventory/inventory-data-unavailable";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import { TransactionRowActions } from "@/features/transaction-log/transaction-row-actions";

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
  COMPLETED: "Submitted requests",
  IN_PROGRESS: "Request queue",
} as const;

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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
            defaultValue={filters.search}
            name="q"
            placeholder="Search transaction id, asset, borrower"
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
              {assetStatusLabels[status]}
            </option>
          ))}
        </select>

        <select
          className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
          defaultValue={filters.type}
          name="type"
        >
          <option value="ALL">All type</option>
          {transactionLogTypeChoices.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </option>
          ))}
        </select>

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface"
          type="submit"
        >
          <Filter className="h-4 w-4" />
          Filter
        </button>
      </div>
    </form>
  );
}

function AssetCell({ row }: { row: TransactionLogRow }) {
  const asset = row.asset;

  return (
    <Link className="group block hover:text-brand-accent" href={`/dashboard/assets/${asset.id}`}>
      <p className="font-bold text-navy transition group-hover:text-brand-accent">
        {asset.assetModel.name}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {asset.assetModel.brand ?? "-"} / {asset.serialNo}
      </p>
    </Link>
  );
}

function BorrowerCell({ row }: { row: TransactionLogRow }) {
  const borrower = row.transaction.requestedBy;

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

function formatRequestTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
                    {asset.assetModel.brand ?? "-"} / SN {asset.serialNo}
                  </p>
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {personName(asset.requestLockedBy)}
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {formatRequestTime(asset.requestLockedAt?.toISOString() ?? null)}
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

function TransactionTable({
  rows,
  user,
}: {
  rows: TransactionLogRow[];
  user: CurrentUser;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-bold">Transaction ID</th>
              <th className="px-5 py-4 font-bold">Asset</th>
              <th className="px-5 py-4 font-bold">Borrower</th>
              <th className="px-5 py-4 font-bold">Request Date</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr className="align-middle" key={row.id}>
                <td className="px-5 py-4 font-bold text-navy">
                  {row.transaction.transactionNo ?? row.transaction.id}
                </td>
                <td className="px-5 py-4">
                  <AssetCell row={row} />
                </td>
                <td className="px-5 py-4">
                  <BorrowerCell row={row} />
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {formatDate(row.transaction.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <AssetStatusBadge status={row.resolvedStatus ?? row.toStatus} />
                </td>
                <td className="px-5 py-4">
                  <TransactionRowActions
                    canReturn={
                      row.transaction.type !== "SOLD" &&
                      !row.returnedAt &&
                      canViewDomainForUser(user, row.asset.domain.code)
                    }
                    transactionId={row.transaction.id}
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
  filters,
  requestQueueAssets,
  total,
  totalPages,
  rows,
  metrics,
  user,
}: {
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
  user: CurrentUser;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SummaryCards filters={filters} metrics={metrics} />
      <Controls filters={filters} />
      {filters.scope !== "COMPLETED" ? (
        <RequestQueueTable assets={requestQueueAssets} />
      ) : null}
      <TransactionTable rows={rows} user={user} />
      <Pagination filters={filters} page={filters.page} total={total} totalPages={totalPages} />
    </div>
  );
}

export function TransactionLogForbidden() {
  return <NoLogAccess />;
}

export default async function TransactionLogPageRoute({
  searchParams,
}: TransactionLogPageProps) {
  const filters = normalizeTransactionLogFilters(await searchParams);
  let result: Awaited<ReturnType<typeof getTransactionLogForUser>>;
  let requestQueueAssets: RequestCartAsset[] = [];
  let user: CurrentUser | null = null;

  try {
    user = await requireCurrentUser("/logs");
    const [logResult, queueResult] = await Promise.all([
      getTransactionLogForUser(user, filters),
      getRequestQueueForLog(),
    ]);
    result = logResult;
    requestQueueAssets = queueResult.assets as RequestCartAsset[];
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
      filters={filters}
      metrics={result.metrics}
      requestQueueAssets={requestQueueAssets}
      rows={result.rows}
      total={result.total}
      totalPages={result.totalPages}
      user={user}
    />
  );
}
