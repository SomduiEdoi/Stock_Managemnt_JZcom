import { requireCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout";

export default async function LogsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/logs");

  return <AppShell user={user}>{children}</AppShell>;
}
