import { requireCurrentUser } from "@/lib/auth";
import {
  canManageDomainForUser,
  canViewDomainForUser,
} from "@/lib/permissions";

const domains = ["SERVER", "NETWORK"] as const;

export default async function DashboardPage() {
  const user = await requireCurrentUser("/dashboard");

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

      <section className="rounded-md border border-border bg-white p-5">
        <h3 className="text-lg font-semibold">Next implementation target</h3>
        <p className="mt-2 text-muted-foreground">
          Build the asset list from database data and reuse these permissions to
          decide which actions are visible and which API mutations are allowed.
        </p>
      </section>
    </div>
  );
}
