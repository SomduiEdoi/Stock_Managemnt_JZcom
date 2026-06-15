import type { ReactNode } from "react";
import type { RoleCode } from "@/lib/permissions";
import { AppSidebar } from "./app-sidebar";
import { UserProfileMenu } from "./user-profile-menu";

type AppShellUser = {
  name: string;
  position: string | null;
  roles: RoleCode[];
};

type AppShellProps = {
  children: ReactNode;
  title?: string;
  user: AppShellUser;
};

export function AppShell({
  children,
  title = "Dashboard Overview",
  user,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
      <AppSidebar roles={user.roles} />

      <section className="min-w-0">
        <header className="border-b border-border bg-white">
          <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 lg:px-7">
            <p className="text-xl font-bold text-navy">{title}</p>

            <UserProfileMenu
              name={user.name}
              position={user.position}
              roles={user.roles}
            />
          </div>
        </header>

        <div className="px-5 py-6 lg:px-7">{children}</div>
      </section>
    </main>
  );
}
