import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth";
import {
  listAssetsForUser,
  normalizeAssetListFilters,
  problemAssetStatusOptions,
  type AssetDomainFilter,
  type AssetListFilters,
} from "@/lib/assets";
import { assetStatusLabels } from "@/lib/status-style";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

type AssetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const domainLabels: Record<AssetDomainFilter, string> = {
  ALL: "All",
  NETWORK: "Network",
  SERVER: "Server",
};

function buildPageHref(page: number, filters: AssetListFilters) {
  return buildFilterHref(filters, { page });
}

function buildFilterHref(
  filters: AssetListFilters,
  overrides: Partial<AssetListFilters>,
) {
  const nextFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (nextFilters.search) {
    params.set("q", nextFilters.search);
  }

  if (nextFilters.domain !== "ALL") {
    params.set("domain", nextFilters.domain);
  }

  if (nextFilters.status !== "ALL") {
    params.set("status", nextFilters.status);
  }

  if (nextFilters.category !== "ALL") {
    params.set("category", nextFilters.category);
  }

  if (nextFilters.type !== "ALL") {
    params.set("type", nextFilters.type);
  }

  if (nextFilters.page > 1) {
    params.set("page", String(nextFilters.page));
  }

  return `/dashboard/assets${params.size ? `?${params.toString()}` : ""}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function ProblemDomainChips({
  filters,
  visibleDomainCodes,
}: {
  filters: AssetListFilters;
  visibleDomainCodes: Array<Exclude<AssetDomainFilter, "ALL">>;
}) {
  const options: AssetDomainFilter[] = ["ALL", ...visibleDomainCodes];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((domain) => {
        const isActive = filters.domain === domain;

        return (
          <Link
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
              isActive
                ? "bg-navy text-white"
                : "bg-surface text-muted-foreground hover:text-navy"
            }`}
            href={buildFilterHref(filters, {
              category: "ALL",
              domain,
              page: 1,
              type: "ALL",
            })}
            key={domain}
          >
            {domain === "ALL" ? "All Problem Items" : domainLabels[domain]}
          </Link>
        );
      })}
    </div>
  );
}

function ProblemFilters({
  filters,
  result,
}: {
  filters: AssetListFilters;
  result: Awaited<ReturnType<typeof listAssetsForUser>>;
}) {
  return (
    <form
      action="/dashboard/assets"
      className="grid gap-3 rounded-md border border-border bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_150px_180px_180px_auto_auto]"
      method="get"
    >
      <input name="page" type="hidden" value="1" />
      <input name="domain" type="hidden" value={filters.domain} />
      <input
        className="h-11 rounded-md border border-border px-3 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
        defaultValue={filters.search}
        name="q"
        placeholder="Search model, brand, category, type, stock code, serial no."
      />

      <select
        className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
        defaultValue={filters.status}
        name="status"
      >
        <option value="ALL">All Problems</option>
        {problemAssetStatusOptions.map((status) => (
          <option key={status} value={status}>
            {assetStatusLabels[status]}
          </option>
        ))}
      </select>

      <select
        className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
        defaultValue={filters.category}
        name="category"
      >
        <option value="ALL">All Categories</option>
        {result.filterOptions.categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>

      <select
        className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
        defaultValue={filters.type}
        name="type"
      >
        <option value="ALL">All Types</option>
        {result.filterOptions.types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <button
        className="h-11 rounded-md bg-navy px-4 text-sm font-bold text-white transition hover:bg-black"
        type="submit"
      >
        Apply
      </button>

      <Link
        className="flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy transition hover:bg-surface"
        href="/dashboard/assets"
      >
        Reset
      </Link>
    </form>
  );
}

function ProblemTable({
  assets,
}: {
  assets: Awaited<ReturnType<typeof listAssetsForUser>>["assets"];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-[17%] px-5 py-4 font-bold">Model</th>
              <th className="w-[10%] px-5 py-4 font-bold">Brand</th>
              <th className="w-[11%] px-5 py-4 font-bold">Category</th>
              <th className="w-[10%] px-5 py-4 font-bold">Type</th>
              <th className="w-[11%] px-5 py-4 font-bold">Stock Code</th>
              <th className="w-[13%] px-5 py-4 font-bold">Serial No.</th>
              <th className="w-[11%] px-5 py-4 font-bold">Status</th>
              <th className="w-[17%] px-5 py-4 font-bold">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assets.map((asset) => (
              <tr className="align-middle transition hover:bg-surface" key={asset.id}>
                <td className="truncate px-5 py-4 font-bold text-navy">
                  <Link className="hover:underline" href={`/dashboard/assets/${asset.id}`}>
                    {asset.assetModel.name}
                  </Link>
                </td>
                <td className="truncate px-5 py-4 text-muted-foreground">
                  {asset.assetModel.brand ?? "-"}
                </td>
                <td className="truncate px-5 py-4 text-ink">
                  {asset.assetModel.category?.name ?? "-"}
                </td>
                <td className="truncate px-5 py-4 text-muted-foreground">
                  {asset.assetModel.typeName ?? "-"}
                </td>
                <td className="truncate px-5 py-4 font-medium text-ink">
                  {asset.stockCode ?? "-"}
                </td>
                <td className="truncate px-5 py-4 font-medium text-ink">
                  {asset.serialNo}
                </td>
                <td className="px-5 py-4">
                  <AssetStatusBadge status={asset.status} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  <p className="whitespace-pre-wrap break-words">{asset.note ?? "-"}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assets.length === 0 ? (
        <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
          No problem items found.
        </div>
      ) : null}
    </section>
  );
}

function Pagination({
  filters,
  totalPages,
}: {
  filters: AssetListFilters;
  totalPages: number;
}) {
  return (
    <footer className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <p>
        Page {formatNumber(filters.page)} of {formatNumber(totalPages)}
      </p>
      <div className="flex gap-2">
        <Link
          aria-disabled={filters.page <= 1}
          className="rounded-md border border-border bg-white px-3 py-2 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={buildPageHref(Math.max(1, filters.page - 1), filters)}
        >
          Previous
        </Link>
        <Link
          aria-disabled={filters.page >= totalPages}
          className="rounded-md border border-border bg-white px-3 py-2 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={buildPageHref(Math.min(totalPages, filters.page + 1), filters)}
        >
          Next
        </Link>
      </div>
    </footer>
  );
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const user = await requireCurrentUser("/dashboard/assets");
  const filters = normalizeAssetListFilters(await searchParams);
  const result = await listAssetsForUser(user, filters);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm font-bold text-muted-foreground"
        >
          <Link className="text-navy transition hover:text-brand-accent" href="/dashboard">
            Dashboard
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>Problem Items</span>
        </nav>
        <h1 className="mt-3 text-3xl font-bold text-ink">Problem Items</h1>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {formatNumber(result.total)} visible problem assets
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <ProblemDomainChips
          filters={filters}
          visibleDomainCodes={result.visibleDomainCodes}
        />
        <ProblemFilters filters={filters} result={result} />
      </div>

      <ProblemTable assets={result.assets} />
      <Pagination filters={filters} totalPages={result.totalPages} />
    </div>
  );
}
