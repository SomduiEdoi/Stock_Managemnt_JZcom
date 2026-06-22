import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Package,
} from "lucide-react";
import { requireCurrentUser } from "@/lib/auth";
import {
  canChangeAssetStatusForUser,
  canDeleteAssetsForUser,
  canManageDomainForUser,
  canRequestDomainForUser,
} from "@/lib/permissions";
import {
  getNetworkInventoryForUser,
  normalizeNetworkInventoryFilters,
  type NetworkInventoryFilters,
} from "@/lib/network-inventory";
import { assetStatusLabels } from "@/lib/status-style";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import { InventoryDataUnavailable } from "@/components/inventory/inventory-data-unavailable";
import { NetworkInventoryControls } from "@/components/inventory/network-inventory-controls";
import { RequestableInventoryTable } from "@/features/inventory/requestable-inventory-table";

type NetworkPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type MetricCardProps = {
  detail: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: "borrow" | "ready" | "request" | "sold" | "total";
  value: number;
};

const toneClasses = {
  borrow: "text-status-borrow",
  ready: "text-status-ready",
  request: "text-status-request",
  sold: "text-status-sold",
  total: "text-brand-accent",
};

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function appendValues(params: URLSearchParams, key: string, values: string[]) {
  values.forEach((value) => params.append(key, value));
}

function buildNetworkPageHref(page: number, filters: NetworkInventoryFilters) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("q", filters.search);
  }

  appendValues(params, "category", filters.categories);
  appendValues(params, "type", filters.types);
  appendValues(params, "status", filters.statuses);
  params.set("page", String(page));

  return `/dashboard/network?${params.toString()}`;
}

function MetricCard({ detail, icon: Icon, label, tone, value }: MetricCardProps) {
  return (
    <article className="rounded-md border border-border bg-white p-5 shadow-sm">
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
}

function NetworkMetrics({
  borrowed,
  ready,
  request,
  sold,
  total,
}: {
  borrowed: number;
  ready: number;
  request: number;
  sold: number;
  total: number;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        detail="Network domain only"
        icon={Package}
        label="Total Network Equipment"
        tone="total"
        value={total}
      />
      <MetricCard
        detail="Ready for use"
        icon={CheckCircle2}
        label="Ready Network Equipment"
        tone="ready"
        value={ready}
      />
      <MetricCard
        detail="Currently borrowed"
        icon={ArrowRightLeft}
        label="Borrowed Network Equipment"
        tone="borrow"
        value={borrowed}
      />
      <MetricCard
        detail="Locked for request"
        icon={ClipboardList}
        label="Active Request"
        tone="request"
        value={request}
      />
      <MetricCard
        detail="Moved to sold state"
        icon={DollarSign}
        label="Sold Network Equipment"
        tone="sold"
        value={sold}
      />
    </section>
  );
}

function Pagination({
  filters,
  page,
  totalPages,
}: {
  filters: NetworkInventoryFilters;
  page: number;
  totalPages: number;
}) {
  return (
    <footer className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <p>
        Page {formatNumber(page)} of {formatNumber(totalPages)}
      </p>
      <div className="flex gap-2">
        <Link
          aria-disabled={page <= 1}
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={buildNetworkPageHref(Math.max(1, page - 1), filters)}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Link>
        <Link
          aria-disabled={page >= totalPages}
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={buildNetworkPageHref(Math.min(totalPages, page + 1), filters)}
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </footer>
  );
}

function NoNetworkAccess() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <h2 className="text-xl font-bold text-navy">No network access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account does not have permission to view network inventory.
      </p>
    </section>
  );
}

export default async function NetworkInventoryPage({
  searchParams,
}: NetworkPageProps) {
  const filters = normalizeNetworkInventoryFilters(await searchParams);
  let user: Awaited<ReturnType<typeof requireCurrentUser>>;
  let result: Awaited<ReturnType<typeof getNetworkInventoryForUser>>;

  try {
    user = await requireCurrentUser("/dashboard/network");
    result = await getNetworkInventoryForUser(user, filters);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <InventoryDataUnavailable
          domainLabel="Network inventory"
          retryHref="/dashboard/network"
        />
      );
    }

    throw error;
  }

  if (!result.canView) {
    return <NoNetworkAccess />;
  }

  const addAssetHref = canManageDomainForUser(user, "NETWORK")
    ? "/dashboard/assets/new?domain=NETWORK"
    : null;

  return (
    <div className="flex flex-col gap-6">
      <NetworkMetrics
        borrowed={result.metrics.borrowed}
        ready={result.metrics.ready}
        request={result.metrics.request}
        sold={result.metrics.sold}
        total={result.metrics.total}
      />

      <NetworkInventoryControls
        addAssetHref={addAssetHref}
        categories={result.filterOptions.categories}
        filters={{
          categories: filters.categories,
          search: filters.search,
          statuses: filters.statuses,
          types: filters.types,
        }}
        statuses={result.filterOptions.statuses.map((status) => ({
          label: assetStatusLabels[status],
          value: status,
        }))}
        total={result.total}
        types={result.filterOptions.types}
      />

      <RequestableInventoryTable
        canChangeStatus={canChangeAssetStatusForUser(user, "NETWORK")}
        canDelete={canDeleteAssetsForUser(user, "NETWORK")}
        canRequest={canRequestDomainForUser(user, "NETWORK")}
        domainLabel="Network"
        rows={result.rows}
      />
      <Pagination
        filters={filters}
        page={filters.page}
        totalPages={result.totalPages}
      />
    </div>
  );
}
