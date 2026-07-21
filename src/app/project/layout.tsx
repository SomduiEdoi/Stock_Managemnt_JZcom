import { requireCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout";

export default async function ProjectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCurrentUser("/project");

  return <AppShell user={user}>{children}</AppShell>;
}
