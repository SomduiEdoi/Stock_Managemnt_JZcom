import { AppShell } from "@/components/layout";
import { InventoryDataUnavailable } from "@/components/inventory/inventory-data-unavailable";
import { requireCurrentUser } from "@/lib/auth";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";

export default async function NetworkInventoryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    const user = await requireCurrentUser("/dashboard/network");

    return <AppShell user={user}>{children}</AppShell>;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <main className="min-h-screen bg-background p-6">
          <InventoryDataUnavailable
            domainLabel="Network inventory"
            retryHref="/dashboard/network"
          />
        </main>
      );
    }

    throw error;
  }
}
