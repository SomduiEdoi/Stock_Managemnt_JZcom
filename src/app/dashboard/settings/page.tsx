import { requireCurrentUser } from "@/lib/auth";
import { SettingsPage } from "@/features/settings/settings-page";

export default async function SettingsRoute() {
  const user = await requireCurrentUser("/dashboard/settings");

  return <SettingsPage user={user} />;
}
