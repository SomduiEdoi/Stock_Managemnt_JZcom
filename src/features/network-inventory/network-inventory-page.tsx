import type { ComponentType } from "react";
import {
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
  canManageWarehouseForUser,
  canRequestWarehouseForUser,
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
import { TablePagination } from "@/components/table/table-pagination";

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

type InventorySortKey =
  | "brand"
  | "category"
  | "model"
  | "serialNo"
  | "status"
  | "stockCode"
  | "type";

function appendValues(params: URLSearchParams, key: string, values: string[]) {
  values.forEach((value) => params.append(key, value));
}

function buildNetworkPageHref(page: number, filters: NetworkInventoryFilters) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("q", filters.search);
  }

  appendValues(params, "brand", filters.brands);
  appendValues(params, "category", filters.categories);
  appendValues(params, "type", filters.types);
  appendValues(params, "status", filters.statuses);
  params.set("sort", filters.sortBy);
  params.set("dir", filters.sortDirection);
  params.set("page", String(page));

  return `/dashboard/network?${params.toString()}`;
}

function buildNetworkSortLinks(filters: NetworkInventoryFilters) {
  const keys: InventorySortKey[] = [
    "model",
    "brand",
    "category",
    "type",
    "stockCode",
    "serialNo",
    "status",
  ];

  return Object.fromEntries(
    keys.map((sortKey) => [
      sortKey,
      {
        asc: buildNetworkPageHref(1, {
          ...filters,
          page: 1,
          sortBy: sortKey,
          sortDirection: "asc",
        }),
        desc: buildNetworkPageHref(1, {
          ...filters,
          page: 1,
          sortBy: sortKey,
          sortDirection: "desc",
        }),
      },
    ]),
  ) as Partial<Record<InventorySortKey, { asc: string; desc: string }>>;
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
        detail="Network warehouse only"
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
    <TablePagination
      currentPage={page}
      hrefForPage={(nextPage) => buildNetworkPageHref(nextPage, filters)}
      totalPages={totalPages}
    />
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
          warehouseLabel="Network inventory"
          retryHref="/dashboard/network"
        />
      );
    }

    throw error;
  }

  if (!result.canView) {
    return <NoNetworkAccess />;
  }

  const addAssetHref = canManageWarehouseForUser(user, "NETWORK")
    ? "/dashboard/assets/new?warehouse=NETWORK"
    : null;
  const selectedCategory = filters.categories.length === 1
    ? result.filterOptions.categoryGroups.find((category) => category.name === filters.categories[0])
    : undefined;
  const exportCustomFields = selectedCategory
    ? selectedCategory.customFields
    : result.filterOptions.categoryGroups.flatMap((category) => category.customFields)
      .filter((field, index, fields) => fields.findIndex((candidate) => candidate.key === field.key) === index);

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
        canManageCategories={canManageWarehouseForUser(user, "NETWORK")}
        brands={result.filterOptions.brands}
        categories={result.filterOptions.categories}
        categoryGroups={result.filterOptions.categoryGroups}
        filters={{
          brands: filters.brands,
          categories: filters.categories,
          search: filters.search,
          sortBy: filters.sortBy,
          sortDirection: filters.sortDirection,
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
        activeSort={{ by: filters.sortBy, direction: filters.sortDirection }}
        canChangeStatus={canChangeAssetStatusForUser(user, "NETWORK")}
        canRecommend={canChangeAssetStatusForUser(user, "NETWORK")}
        canDelete={canDeleteAssetsForUser(user, "NETWORK")}
        canRequest={canRequestWarehouseForUser(user, "NETWORK")}
        warehouseCode="NETWORK"
        favoriteOnly={filters.favoriteOnly}
        warehouseLabel="Network"
        categoryName={selectedCategory?.name}
        customFieldDefinitions={exportCustomFields.map((field) => ({ key: field.key, label: field.label, unit: field.unit }))}
        rows={result.rows}
        sortLinks={buildNetworkSortLinks(filters)}
      />
      <Pagination
        filters={filters}
        page={filters.page}
        totalPages={result.totalPages}
      />
    </div>
  );
}







