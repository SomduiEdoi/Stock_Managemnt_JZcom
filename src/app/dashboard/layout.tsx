import { requireCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/dashboard");

  return (
    <AppShell title="Dashboard Overview" user={user}>
      {children}
    </AppShell>
  );
}
