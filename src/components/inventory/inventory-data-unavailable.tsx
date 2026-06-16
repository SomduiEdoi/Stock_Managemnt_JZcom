import Link from "next/link";
import { DatabaseZap, RefreshCw } from "lucide-react";

type InventoryDataUnavailableProps = {
  domainLabel: string;
  retryHref: string;
};

export function InventoryDataUnavailable({
  domainLabel,
  retryHref,
}: InventoryDataUnavailableProps) {
  return (
    <section className="rounded-md border border-border bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface text-navy">
            <DatabaseZap className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Inventory temporarily unavailable
            </p>
            <h2 className="mt-2 text-2xl font-bold text-navy">
              {domainLabel} data cannot be loaded
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-muted-foreground">
              PostgreSQL is not reachable at localhost:5432. Start the database,
              then reload this page.
            </p>
          </div>
        </div>

        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm transition hover:bg-surface"
          href={retryHref}
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </Link>
      </div>
    </section>
  );
}
