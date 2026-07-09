import { AppShell } from "@/components/layout";
import { requireCurrentUser } from "@/lib/auth";

export default async function InventoryDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/dashboard");

  return <AppShell user={user}>{children}</AppShell>;
}
