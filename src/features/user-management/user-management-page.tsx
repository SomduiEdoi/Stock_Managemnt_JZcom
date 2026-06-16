import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Filter,
  Search,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
  UserRoundCheck,
} from "lucide-react";
import {
  buildUserManagementHref,
  type UserManagementFilters,
  type UserManagementRow,
  userRoleOptions,
} from "@/lib/user-management";
import { UserActionMenu } from "@/features/user-management/user-action-menu";

type UserManagementPageProps = {
  filters: UserManagementFilters;
  metrics: {
    active: number;
    owners: number;
    staff: number;
    total: number;
  };
  total: number;
  totalPages: number;
  users: UserManagementRow[];
};

type MetricCardProps = {
  detail: string;
  icon: typeof Users;
  label: string;
  value: number;
};

const roleLabels = {
  ADMIN: "Admin",
  NETWORK_OWNER: "Network Owner",
  SERVER_OWNER: "Server Owner",
  STAFF: "Staff",
} as const;

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getUserInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roleText(user: UserManagementRow) {
  return user.roles
    .map(({ role }) => roleLabels[role.code] ?? role.name)
    .join(", ");
}

function MetricCard({ detail, icon: Icon, label, value }: MetricCardProps) {
  return (
    <article className="rounded-md border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-4 text-3xl font-bold leading-none text-ink">
            {formatNumber(value)}
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-navy">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold text-brand-accent">{detail}</p>
    </article>
  );
}

function Metrics({ metrics }: Pick<UserManagementPageProps, "metrics">) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        detail="All system accounts"
        icon={Users}
        label="Total Users"
        value={metrics.total}
      />
      <MetricCard
        detail="Server and network owners"
        icon={ShieldCheck}
        label="Owner"
        value={metrics.owners}
      />
      <MetricCard
        detail="Read-only operational users"
        icon={UserCog}
        label="Staff"
        value={metrics.staff}
      />
      <MetricCard
        detail="Can currently sign in"
        icon={UserRoundCheck}
        label="Active"
        value={metrics.active}
      />
    </section>
  );
}

function Controls({ filters }: { filters: UserManagementFilters }) {
  return (
    <form
      action="/user"
      className="grid gap-3 rounded-md border border-border bg-white p-4 shadow-sm lg:grid-cols-[1fr_190px_170px_auto_auto]"
      method="get"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
          defaultValue={filters.search}
          name="q"
          placeholder="Search name, mail, role, position"
        />
      </div>

      <select
        className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
        defaultValue={filters.role}
        name="role"
      >
        <option value="ALL">All roles</option>
        {userRoleOptions.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </select>

      <select
        className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
        defaultValue={filters.status}
        name="status"
      >
        <option value="ALL">All status</option>
        <option value="ACTIVE">Active</option>
        <option value="BLOCKED">Blocked</option>
      </select>

      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface"
        type="submit"
      >
        <Filter className="h-4 w-4" />
        Filter
      </button>

      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm hover:bg-navy/90"
        type="button"
      >
        <UserPlus className="h-4 w-4" />
        Add User
      </button>
    </form>
  );
}

function DomainPermissionBadges({ user }: { user: UserManagementRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.domainPermissions.length === 0 ? (
        <span className="text-xs font-semibold text-muted-foreground">-</span>
      ) : (
        user.domainPermissions.map((permission) => (
          <span
            className="rounded-md bg-surface px-2 py-1 text-xs font-bold text-navy"
            key={permission.domain.code}
          >
            {permission.domain.code}
            {permission.canManage ? " / manage" : ""}
          </span>
        ))
      )}
    </div>
  );
}

function RoleBadges({ user }: { user: UserManagementRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.roles.map(({ role }) => (
        <span
          className="rounded-md bg-navy px-2 py-1 text-xs font-bold text-white"
          key={role.code}
        >
          {roleLabels[role.code] ?? role.name}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
      <span
        className={`h-2 w-2 rounded-full ${
          isActive ? "bg-status-ready" : "bg-status-fail"
        }`}
      />
      {isActive ? "Active" : "Blocked"}
    </span>
  );
}

function UserTable({
  filters,
  total,
  totalPages,
  users,
}: Pick<UserManagementPageProps, "filters" | "total" | "totalPages" | "users">) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-bold">Name</th>
              <th className="px-5 py-4 font-bold">Mail</th>
              <th className="px-5 py-4 font-bold">Role</th>
              <th className="px-5 py-4 font-bold">Position</th>
              <th className="px-5 py-4 font-bold">Domain</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Action</th>
              <th className="px-5 py-4 font-bold">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr className="align-middle" key={user.id}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-sm font-bold text-white">
                      {getUserInitials(user.name)}
                    </span>
                    <div>
                      <p className="font-bold text-navy">{user.name}</p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {roleText(user) || "No role"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {user.email}
                </td>
                <td className="px-5 py-4">
                  <RoleBadges user={user} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {user.position ?? "-"}
                </td>
                <td className="px-5 py-4">
                  <DomainPermissionBadges user={user} />
                </td>
                <td className="px-5 py-4">
                  <StatusBadge isActive={user.isActive} />
                </td>
                <td className="px-5 py-4">
                  <UserActionMenu isActive={user.isActive} userName={user.name} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatDateTime(user.lastLoginAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 ? (
        <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
          No users found.
        </div>
      ) : null}

      <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          Showing {users.length.toLocaleString("en-US")} of{" "}
          {total.toLocaleString("en-US")} users
        </p>
        <div className="flex gap-2">
          <Link
            aria-disabled={filters.page <= 1}
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href={buildUserManagementHref(filters, {
              page: Math.max(1, filters.page - 1),
            })}
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Link>
          <Link
            aria-disabled={filters.page >= totalPages}
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-navy px-3 font-semibold text-white aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href={buildUserManagementHref(filters, {
              page: Math.min(totalPages, filters.page + 1),
            })}
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </footer>
    </section>
  );
}

function ManagementHeader() {
  return null;
}

export function UserManagementPage({
  filters,
  metrics,
  total,
  totalPages,
  users,
}: UserManagementPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <ManagementHeader />
      <Metrics metrics={metrics} />
      <Controls filters={filters} />
      <UserTable
        filters={filters}
        total={total}
        totalPages={totalPages}
        users={users}
      />
    </div>
  );
}

export function UserManagementForbidden() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <Users className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-bold text-navy">Admin access required</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Only admin users can manage system accounts.
      </p>
    </section>
  );
}
