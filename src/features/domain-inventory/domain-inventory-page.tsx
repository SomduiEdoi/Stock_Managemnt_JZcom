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
  getDomainInventoryForUser,
  normalizeDomainInventoryFilters,
  type DomainInventoryFilters,
  type InventorySortBy,
} from "@/lib/domain-inventory";
import { assetStatusLabels } from "@/lib/status-style";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import { InventoryDataUnavailable } from "@/components/inventory/inventory-data-unavailable";
import { ServerInventoryControls } from "@/components/inventory/server-inventory-controls";
import { RequestableInventoryTable } from "@/features/inventory/requestable-inventory-table";

type DomainInventoryPageProps = {
  domainCode: string;
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

function baseHref(domainCode: string) {
  return `/dashboard/inventory/${encodeURIComponent(domainCode)}`;
}

function buildPageHref(domainCode: string, page: number, filters: DomainInventoryFilters) {
  const params = new URLSearchParams();

  if (filters.search) params.set("q", filters.search);
  appendValues(params, "category", filters.categories);
  appendValues(params, "type", filters.types);
  appendValues(params, "status", filters.statuses);
  params.set("sort", filters.sortBy);
  params.set("dir", filters.sortDirection);
  params.set("page", String(page));

  return `${baseHref(domainCode)}?${params.toString()}`;
}

function buildSortLinks(domainCode: string, filters: DomainInventoryFilters) {
  const keys: InventorySortBy[] = [
    "serialNo",
    "model",
    "category",
    "type",
    "brand",
    "stockCode",
    "availability",
    "status",
  ];

  return Object.fromEntries(
    keys.map((sortKey) => [
      sortKey,
      {
        asc: buildPageHref(domainCode, 1, {
          ...filters,
          page: 1,
          sortBy: sortKey,
          sortDirection: "asc",
        }),
        desc: buildPageHref(domainCode, 1, {
          ...filters,
          page: 1,
          sortBy: sortKey,
          sortDirection: "desc",
        }),
      },
    ]),
  );
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
      <p className={`mt-4 text-xs font-semibold ${toneClasses[tone]}`}>{detail}</p>
    </article>
  );
}

function DomainMetrics({
  borrowed,
  domainName,
  ready,
  request,
  sold,
  total,
}: {
  borrowed: number;
  domainName: string;
  ready: number;
  request: number;
  sold: number;
  total: number;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard detail={`${domainName} domain only`} icon={Package} label={`Total ${domainName} Equipment`} tone="total" value={total} />
      <MetricCard detail="Ready for use" icon={CheckCircle2} label={`Ready ${domainName} Equipment`} tone="ready" value={ready} />
      <MetricCard detail="Currently borrowed" icon={ArrowRightLeft} label={`Borrowed ${domainName} Equipment`} tone="borrow" value={borrowed} />
      <MetricCard detail="Locked for request" icon={ClipboardList} label="Active Request" tone="request" value={request} />
      <MetricCard detail="Moved to sold state" icon={DollarSign} label={`Sold ${domainName} Equipment`} tone="sold" value={sold} />
    </section>
  );
}

function Pagination({
  domainCode,
  filters,
  page,
  totalPages,
}: {
  domainCode: string;
  filters: DomainInventoryFilters;
  page: number;
  totalPages: number;
}) {
  return (
    <footer className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <p>Page {formatNumber(page)} of {formatNumber(totalPages)}</p>
      <div className="flex gap-2">
        <Link aria-disabled={page <= 1} className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50" href={buildPageHref(domainCode, Math.max(1, page - 1), filters)}>
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Link>
        <Link aria-disabled={page >= totalPages} className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50" href={buildPageHref(domainCode, Math.min(totalPages, page + 1), filters)}>
          Next
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </footer>
  );
}

function NoDomainAccess({ domainCode }: { domainCode: string }) {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <h2 className="text-xl font-bold text-navy">No domain access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account does not have permission to view {domainCode} inventory.
      </p>
    </section>
  );
}

export async function DomainInventoryPage({ domainCode, searchParams }: DomainInventoryPageProps) {
  const filters = normalizeDomainInventoryFilters(await searchParams);
  let user: Awaited<ReturnType<typeof requireCurrentUser>>;
  let result: Awaited<ReturnType<typeof getDomainInventoryForUser>>;

  try {
    user = await requireCurrentUser(baseHref(domainCode));
    result = await getDomainInventoryForUser(user, domainCode, filters);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return <InventoryDataUnavailable domainLabel={`${domainCode} inventory`} retryHref={baseHref(domainCode)} />;
    }

    throw error;
  }

  if (!result.canView || !result.domain) {
    return <NoDomainAccess domainCode={domainCode} />;
  }

  const domainName = result.domain.name || result.domain.code;
  const href = baseHref(result.domain.code);
  const inventoryFamily = result.rows.some((row) => row.assetModel.assetType?.trackMethod === "QUANTITY")
    ? "QUANTITY"
    : "SERIAL";
  const addAssetHref = canManageDomainForUser(user, result.domain.code)
    ? `/dashboard/assets/new?domain=${encodeURIComponent(result.domain.code)}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <DomainMetrics
        borrowed={result.metrics.borrowed}
        domainName={domainName}
        ready={result.metrics.ready}
        request={result.metrics.request}
        sold={result.metrics.sold}
        total={result.metrics.total}
      />

      <ServerInventoryControls
        addAssetHref={addAssetHref}
        baseHref={href}
        categories={result.filterOptions.categories}
        filters={{
          categories: filters.categories,
          search: filters.search,
          sortBy: filters.sortBy,
          sortDirection: filters.sortDirection,
          statuses: filters.statuses,
          types: filters.types,
        }}
        statuses={result.filterOptions.statuses.map((status) => ({ label: assetStatusLabels[status], value: status }))}
        total={result.total}
        types={result.filterOptions.types}
      />

      <RequestableInventoryTable
        activeSort={{ by: filters.sortBy, direction: filters.sortDirection }}
        canChangeStatus={canChangeAssetStatusForUser(user, result.domain.code)}
        canDelete={canDeleteAssetsForUser(user, result.domain.code)}
        canRequest={canRequestDomainForUser(user, result.domain.code)}
        domainLabel={domainName}
        inventoryFamily={inventoryFamily}
        rows={result.rows}
        sortLinks={buildSortLinks(result.domain.code, filters)}
      />
      <Pagination domainCode={result.domain.code} filters={filters} page={filters.page} totalPages={result.totalPages} />
    </div>
  );
}
