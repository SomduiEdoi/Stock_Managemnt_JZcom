import type { ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth";
import { getRequestCartForUser } from "@/lib/request-cart";
import { AppSidebar } from "./app-sidebar";
import { AppShellTitle } from "./app-shell-title";
import { UserProfileMenu } from "./user-profile-menu";

type AppShellProps = {
  children: ReactNode;
  title?: string;
  user: CurrentUser;
};

export async function AppShell({ children, title, user }: AppShellProps) {
  const requestCart = await getRequestCartForUser(user as CurrentUser);
  const requestCount = requestCart.canRequest ? requestCart.assets.length : 0;

  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
      <AppSidebar requestCount={requestCount} roles={user.roles} />

      <section className="min-w-0">
        <header className="border-b border-border bg-white">
          <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 lg:px-7">
            <AppShellTitle title={title} />

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
