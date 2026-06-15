import { AppShell } from "@/components/layout";
import { requireCurrentUser } from "@/lib/auth";

export default async function ServerInventoryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/dashboard/server");

  return <AppShell user={user}>{children}</AppShell>;
}
