import { requireCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout";

export default async function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/user");

  return <AppShell user={user}>{children}</AppShell>;
}
