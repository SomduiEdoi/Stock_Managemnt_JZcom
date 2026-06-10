import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import { getAssetOverviewForUser } from "@/lib/assets";
import {
  canManageDomainForUser,
  canViewDomainForUser,
} from "@/lib/permissions";

const domains = ["SERVER", "NETWORK"] as const;

export default async function DashboardPage() {
  const user = await requireCurrentUser("/dashboard");
  const overview = await getAssetOverviewForUser(user);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Dashboard
        </p>
        <h2 className="mt-2 text-3xl font-semibold">Permission overview</h2>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {domains.map((domainCode) => (
          <div
            className="rounded-md border border-border bg-white p-5"
            key={domainCode}
          >
            <p className="text-sm text-muted-foreground">{domainCode}</p>
            <p className="mt-2 text-2xl font-semibold">
              {canManageDomainForUser(user, domainCode)
                ? "Manage"
                : canViewDomainForUser(user, domainCode)
                  ? "Read-only"
                  : "No access"}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-border bg-white p-5">
          <p className="text-sm text-muted-foreground">Visible assets</p>
          <p className="mt-2 text-2xl font-semibold">
            {overview.total.toLocaleString()}
          </p>
        </div>
        {overview.byDomain.map((item) => (
          <div
            className="rounded-md border border-border bg-white p-5"
            key={item.domainCode}
          >
            <p className="text-sm text-muted-foreground">{item.domainCode}</p>
            <p className="mt-2 text-2xl font-semibold">
              {item.total.toLocaleString()}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-border bg-white p-5">
        <h3 className="text-lg font-semibold">Asset list</h3>
        <p className="mt-2 text-muted-foreground">
          Browse imported SharePoint assets with search, filters, and
          permission-scoped visibility.
        </p>
        <Link
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          href="/dashboard/assets"
        >
          Open assets
        </Link>
      </section>
    </div>
  );
}
