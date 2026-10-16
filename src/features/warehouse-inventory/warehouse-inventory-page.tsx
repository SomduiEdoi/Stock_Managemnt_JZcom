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
  getWarehouseInventoryForUser,
  normalizeWarehouseInventoryFilters,
  type WarehouseInventoryFilters,
  type InventorySortBy,
} from "@/lib/warehouse-inventory";
import { assetStatusLabels } from "@/lib/status-style";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import { InventoryDataUnavailable } from "@/components/inventory/inventory-data-unavailable";
import { ServerInventoryControls } from "@/components/inventory/server-inventory-controls";
import { RequestableInventoryTable } from "@/features/inventory/requestable-inventory-table";
import { formatWarehouseHeading } from "@/lib/display-labels";
import { TablePagination } from "@/components/table/table-pagination";

type WarehouseInventoryPageProps = {
  warehouseCode: string;
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

function baseHref(warehouseCode: string) {
  return `/dashboard/inventory/${encodeURIComponent(warehouseCode)}`;
}

function buildPageHref(warehouseCode: string, page: number, filters: WarehouseInventoryFilters) {
  const params = new URLSearchParams();

  if (filters.search) params.set("q", filters.search);
  appendValues(params, "brand", filters.brands);
  appendValues(params, "category", filters.categories);
  appendValues(params, "type", filters.types);
  appendValues(params, "status", filters.statuses);
  params.set("sort", filters.sortBy);
  params.set("dir", filters.sortDirection);
  params.set("page", String(page));

  return `${baseHref(warehouseCode)}?${params.toString()}`;
}

function buildSortLinks(warehouseCode: string, filters: WarehouseInventoryFilters) {
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
        asc: buildPageHref(warehouseCode, 1, {
          ...filters,
          page: 1,
          sortBy: sortKey,
          sortDirection: "asc",
        }),
        desc: buildPageHref(warehouseCode, 1, {
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

function WarehouseMetrics({
  borrowed,
  warehouseName,
  ready,
  request,
  sold,
  total,
}: {
  borrowed: number;
  warehouseName: string;
  ready: number;
  request: number;
  sold: number;
  total: number;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard detail={`${warehouseName} warehouse only`} icon={Package} label={`Total ${warehouseName} Equipment`} tone="total" value={total} />
      <MetricCard detail="Ready for use" icon={CheckCircle2} label={`Ready ${warehouseName} Equipment`} tone="ready" value={ready} />
      <MetricCard detail="Currently borrowed" icon={ArrowRightLeft} label={`Borrowed ${warehouseName} Equipment`} tone="borrow" value={borrowed} />
      <MetricCard detail="Locked for request" icon={ClipboardList} label="Active Request" tone="request" value={request} />
      <MetricCard detail="Moved to sold state" icon={DollarSign} label={`Sold ${warehouseName} Equipment`} tone="sold" value={sold} />
    </section>
  );
}

function Pagination({
  warehouseCode,
  filters,
  page,
  totalPages,
}: {
  warehouseCode: string;
  filters: WarehouseInventoryFilters;
  page: number;
  totalPages: number;
}) {
  return (
    <TablePagination
      currentPage={page}
      hrefForPage={(nextPage) => buildPageHref(warehouseCode, nextPage, filters)}
      totalPages={totalPages}
    />
  );
}

function NoWarehouseAccess({ warehouseCode }: { warehouseCode: string }) {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <h2 className="text-xl font-bold text-navy">No warehouse access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account does not have permission to view {warehouseCode} inventory.
      </p>
    </section>
  );
}

export async function WarehouseInventoryPage({ warehouseCode, searchParams }: WarehouseInventoryPageProps) {
  const filters = normalizeWarehouseInventoryFilters(await searchParams);
  let user: Awaited<ReturnType<typeof requireCurrentUser>>;
  let result: Awaited<ReturnType<typeof getWarehouseInventoryForUser>>;

  try {
    user = await requireCurrentUser(baseHref(warehouseCode));
    result = await getWarehouseInventoryForUser(user, warehouseCode, filters);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return <InventoryDataUnavailable warehouseLabel={formatWarehouseHeading(warehouseCode)} retryHref={baseHref(warehouseCode)} />;
    }

    throw error;
  }

  if (!result.canView || !result.warehouse) {
    return <NoWarehouseAccess warehouseCode={warehouseCode} />;
  }

  const warehouseName = result.warehouse.name || result.warehouse.code;
  const href = baseHref(result.warehouse.code);
  const addAssetHref = canManageWarehouseForUser(user, result.warehouse.code)
    ? `/dashboard/assets/new?warehouse=${encodeURIComponent(result.warehouse.code)}`
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
      <WarehouseMetrics
        borrowed={result.metrics.borrowed}
        warehouseName={warehouseName}
        ready={result.metrics.ready}
        request={result.metrics.request}
        sold={result.metrics.sold}
        total={result.metrics.total}
      />

      <ServerInventoryControls
        addAssetHref={addAssetHref}
        baseHref={href}
        canManageCategories={canManageWarehouseForUser(user, result.warehouse.code)}
        brands={result.filterOptions.brands}
        categories={result.filterOptions.categories}
        categoryGroups={result.filterOptions.categoryGroups}
        warehouseCode={result.warehouse.code}
        warehouseLabel={warehouseName}
        filters={{
          brands: filters.brands,
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
        canChangeStatus={canChangeAssetStatusForUser(user, result.warehouse.code)}
        canRecommend={canChangeAssetStatusForUser(user, result.warehouse.code)}
        canDelete={canDeleteAssetsForUser(user, result.warehouse.code)}
        canRequest={canRequestWarehouseForUser(user, result.warehouse.code)}
        warehouseCode={result.warehouse.code}
        favoriteOnly={filters.favoriteOnly}
        warehouseLabel={warehouseName}
        categoryName={selectedCategory?.name}
        customFieldDefinitions={exportCustomFields.map((field) => ({ key: field.key, label: field.label, unit: field.unit }))}
        rows={result.rows}
        sortLinks={buildSortLinks(result.warehouse.code, filters)}
      />
      <Pagination warehouseCode={result.warehouse.code} filters={filters} page={filters.page} totalPages={result.totalPages} />
    </div>
  );
}

