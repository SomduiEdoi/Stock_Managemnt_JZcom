import Link from "next/link";

const foundations = [
  "Serialized assets by serial no.",
  "Server and Network domain permissions",
  "Current state in assets.status",
  "Audit trail in asset_status_histories",
  "SharePoint CSV sources in data",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="border-b border-border pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Stock Management System
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            Serialized asset foundation is ready.
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            This scaffold is set up for the Server and Network asset workflow:
            one item per serial no., role/domain permissions, and status history.
          </p>
        </header>

        <section className="grid gap-3 md:grid-cols-2">
          {foundations.map((item) => (
            <div key={item} className="rounded-md border border-border p-4">
              {item}
            </div>
          ))}
        </section>

        <Link
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          href="/dashboard"
        >
          Open dashboard shell
        </Link>
      </div>
    </main>
  );
}

