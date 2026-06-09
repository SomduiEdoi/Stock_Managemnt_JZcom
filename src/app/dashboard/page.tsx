const summaryItems = [
  { label: "Source files", value: "2" },
  { label: "Network rows", value: "594" },
  { label: "Server rows", value: "551" },
  { label: "Blank serial no.", value: "0" },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Asset overview shell</h1>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-md border border-border p-5">
          <h2 className="text-lg font-semibold">Next implementation target</h2>
          <p className="mt-2 text-muted-foreground">
            Connect PostgreSQL, run Prisma migration, seed users/domains, then
            build the SharePoint import service.
          </p>
        </section>
      </div>
    </main>
  );
}

