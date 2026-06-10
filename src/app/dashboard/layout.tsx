import { requireCurrentUser } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/dashboard");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Stock Management System
            </p>
            <h1 className="mt-1 text-xl font-semibold">{user.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <LogoutButton />
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <span
                  className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium"
                  key={role}
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {user.permissions.map((permission) => (
            <div
              className="rounded-md border border-border bg-white p-4"
              key={permission.domainCode}
            >
              <p className="text-sm font-semibold">{permission.domainCode}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {permission.canManage ? "Can manage" : "Read-only"}
              </p>
            </div>
          ))}
        </div>
        {children}
      </section>
    </main>
  );
}
