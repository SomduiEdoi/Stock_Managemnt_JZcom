import { requireCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout";

export default async function RequestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/request");

  return <AppShell user={user}>{children}</AppShell>;
}
