import { requireCurrentUser } from "@/lib/auth";
import {
  getUserManagementForAdmin,
  normalizeUserManagementFilters,
} from "@/lib/user-management";
import {
  UserManagementForbidden,
  UserManagementPage,
} from "@/features/user-management/user-management-page";

type UserRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UserRoute({ searchParams }: UserRouteProps) {
  const user = await requireCurrentUser("/user");
  const filters = normalizeUserManagementFilters(await searchParams);
  const result = await getUserManagementForAdmin(user, filters);

  if (!result.canManage) {
    return <UserManagementForbidden />;
  }

  return (
    <UserManagementPage
      filters={filters}
      metrics={result.metrics}
      total={result.total}
      totalPages={result.totalPages}
      users={result.users}
    />
  );
}
