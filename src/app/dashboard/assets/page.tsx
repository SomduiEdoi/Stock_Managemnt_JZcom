import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import {
  assetStatusOptions,
  listAssetsForUser,
  normalizeAssetListFilters,
  type AssetDomainAccess,
} from "@/lib/assets";
import {
  assetStatusBadgeClasses,
  assetStatusLabels,
} from "@/lib/status-style";

type AssetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const accessLabels: Record<AssetDomainAccess, string> = {
  MANAGE: "Manage",
  NONE: "No access",
  READ_ONLY: "Read-only",
};

function buildPageHref(page: number, filters: URLSearchParams) {
  const nextParams = new URLSearchParams(filters);
  nextParams.set("page", String(page));

  return `/dashboard/assets?${nextParams.toString()}`;
}

function toSearchParams(filters: {
  domain: string;
  search: string;
  status: string;
}) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("q", filters.search);
  }

  if (filters.domain !== "ALL") {
    params.set("domain", filters.domain);
  }

  if (filters.status !== "ALL") {
    params.set("status", filters.status);
  }

  return params;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const user = await requireCurrentUser("/dashboard/assets");
  const filters = normalizeAssetListFilters(await searchParams);
  const result = await listAssetsForUser(user, filters);
  const activeParams = toSearchParams(filters);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Assets
        </p>
        <h2 className="mt-2 text-3xl font-semibold">Stock asset list</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.total.toLocaleString()} visible assets
        </p>
      </header>

      <form
        action="/dashboard/assets"
        className="grid gap-3 rounded-md border border-border bg-white p-4 md:grid-cols-[1fr_160px_160px_auto_auto]"
      >
        <input
          className="h-10 rounded-md border border-border px-3 text-sm outline-none ring-primary/25 transition focus:ring-4"
          defaultValue={filters.search}
          name="q"
          placeholder="Serial, model, part no., stock code"
        />

        <select
          className="h-10 rounded-md border border-border bg-white px-3 text-sm"
          defaultValue={filters.domain}
          name="domain"
        >
          <option value="ALL">All domains</option>
          {result.visibleDomainCodes.map((domainCode) => (
            <option key={domainCode} value={domainCode}>
              {domainCode}
            </option>
          ))}
        </select>

        <select
          className="h-10 rounded-md border border-border bg-white px-3 text-sm"
          defaultValue={filters.status}
          name="status"
        >
          <option value="ALL">All status</option>
          {assetStatusOptions.map((status) => (
            <option key={status} value={status}>
              {assetStatusLabels[status]}
            </option>
          ))}
        </select>

        <button
          className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          type="submit"
        >
          Apply
        </button>

        <Link
          className="flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
          href="/dashboard/assets"
        >
          Reset
        </Link>
      </form>

      <section className="overflow-hidden rounded-md border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Serial No.</th>
                <th className="px-4 py-3 font-semibold">Model</th>
                <th className="px-4 py-3 font-semibold">Domain</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Access</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.assets.map((asset) => (
                <tr key={asset.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{asset.serialNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{asset.assetModel.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[asset.assetModel.brand, asset.assetModel.partNo]
                        .filter(Boolean)
                        .join(" / ") || "No model reference"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{asset.domain.code}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {asset.assetModel.category?.name ?? "No category"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex min-w-[88px] justify-center rounded-full px-3 py-1 text-xs font-semibold ${assetStatusBadgeClasses[asset.status]}`}
                    >
                      {assetStatusLabels[asset.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {asset.location?.name ?? asset.locationText ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    {accessLabels[asset.domainAccess]}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(asset.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {result.assets.length === 0 ? (
          <div className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No assets found.
          </div>
        ) : null}
      </section>

      <footer className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          Page {filters.page.toLocaleString()} of{" "}
          {result.totalPages.toLocaleString()}
        </p>
        <div className="flex gap-2">
          <Link
            aria-disabled={filters.page <= 1}
            className="rounded-md border border-border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href={buildPageHref(Math.max(1, filters.page - 1), activeParams)}
          >
            Previous
          </Link>
          <Link
            aria-disabled={filters.page >= result.totalPages}
            className="rounded-md border border-border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href={buildPageHref(
              Math.min(result.totalPages, filters.page + 1),
              activeParams,
            )}
          >
            Next
          </Link>
        </div>
      </footer>
    </div>
  );
}
