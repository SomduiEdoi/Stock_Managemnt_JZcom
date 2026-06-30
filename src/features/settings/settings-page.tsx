import Link from "next/link";
import {
  BadgeCheck,
  BriefcaseBusiness,
  FolderLock,
  KeyRound,
  LayoutDashboard,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { SettingsSignOutButton } from "./settings-sign-out-button";

type SettingsPageProps = {
  user: CurrentUser;
};

function formatDateTime(value: Date | null) {
  if (!value) {
    return "No recorded login yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roleLabel(role: string) {
  if (role === "ADMIN") {
    return "Administrator";
  }

  if (role === "STAFF") {
    return "Staff";
  }

  if (role === "OWNER") {
    return "Stock Controller";
  }

  return role;
}

function domainLabel(domainCode: string) {
  return domainCode === "SERVER" ? "Server" : "Network";
}

function authLabel(user: CurrentUser) {
  return user.azureAdObjectId
    ? "Microsoft 365 Connected"
    : "Local Password Sign-In";
}

function accessSummary(user: CurrentUser) {
  if (user.roles.includes("ADMIN")) {
    return "Full system access";
  }

  const manageableDomains = user.permissions
    .filter((permission) => permission.canManage)
    .map((permission) => domainLabel(permission.domainCode));

  if (manageableDomains.length > 0) {
    return `${manageableDomains.join(" / ")} controller`;
  }

  return "Read-only inventory access";
}

function quickActionHref(user: CurrentUser) {
  if (user.roles.includes("ADMIN")) {
    return "/user";
  }

  if (user.roles.includes("STAFF")) {
    return "/request";
  }

  return "/dashboard";
}

function quickActionLabel(user: CurrentUser) {
  if (user.roles.includes("ADMIN")) {
    return "Manage Users";
  }

  if (user.roles.includes("STAFF")) {
    return "Open Request";
  }

  return "Open Dashboard";
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-md border border-border bg-white shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-bold text-navy">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface/40 px-4 py-3">
      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-white text-navy shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-semibold text-ink">
          {value}
        </p>
      </div>
    </div>
  );
}

function PermissionPill({
  canManage,
  canView,
  domainCode,
}: {
  canManage: boolean;
  canView: boolean;
  domainCode: string;
}) {
  const label = canManage ? "Manage" : canView ? "View" : "No access";
  const tone = canManage
    ? "bg-status-ready/15 text-status-ready"
    : canView
      ? "bg-status-borrow/15 text-status-borrow"
      : "bg-surface text-muted-foreground";

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-white px-4 py-3">
      <div>
        <p className="text-sm font-bold text-navy">{domainLabel(domainCode)}</p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Inventory domain permission
        </p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
        {label}
      </span>
    </div>
  );
}

export function SettingsPage({ user }: SettingsPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-md border border-border bg-white shadow-sm">
        <div className="border-b border-border bg-[linear-gradient(135deg,#273F4F_0%,#35556A_100%)] px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
            Personal Settings
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Profile & Access
          </h1>
        </div>

        <div className="grid gap-6 p-5 xl:grid-cols-[280px_1fr]">
          <div className="rounded-md bg-surface p-5">
            <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-navy text-3xl font-bold text-white shadow-sm">
              {getInitials(user.name)}
            </div>
            <h2 className="mt-5 text-2xl font-bold text-navy">{user.name}</h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {user.position ?? "No position assigned"}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <span
                  className="rounded-full bg-brand-accent/15 px-3 py-1 text-xs font-bold text-brand-accent"
                  key={role}
                >
                  {roleLabel(role)}
                </span>
              ))}
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Access Summary
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-ink">
                {accessSummary(user)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DetailRow icon={UserRound} label="Full Name" value={user.name} />
            <DetailRow icon={Mail} label="Email" value={user.email} />
            <DetailRow
              icon={BriefcaseBusiness}
              label="Position"
              value={user.position ?? "Not set"}
            />
            <DetailRow
              icon={BadgeCheck}
              label="Authentication"
              value={authLabel(user)}
            />
            <DetailRow
              icon={MonitorSmartphone}
              label="Last Login"
              value={formatDateTime(user.lastLoginAt)}
            />
            <DetailRow
              icon={KeyRound}
              label="Primary Role"
              value={roleLabel(user.roles[0] ?? "USER")}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Section title="Domain Permissions">
          <div className="grid gap-3">
            {user.permissions.length > 0 ? (
              user.permissions.map((permission) => (
                <PermissionPill
                  canManage={permission.canManage}
                  canView={permission.canView}
                  domainCode={permission.domainCode}
                  key={permission.domainCode}
                />
              ))
            ) : (
              <p className="text-sm font-medium text-muted-foreground">
                No domain permissions assigned.
              </p>
            )}
          </div>
        </Section>

        <Section title="Account Actions">
          <div className="grid gap-4">
            <div className="rounded-md border border-border bg-surface/40 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-navy shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-navy">
                    Security Status
                  </p>
                  <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">
                    This account is active and can access the stock system based
                    on the roles and domain permissions shown on this page.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border bg-surface/40 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-navy shadow-sm">
                  <FolderLock className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-navy">Quick Access</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">
                    Jump back into the part of the system that matches your
                    role.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white transition hover:bg-black"
                  href={quickActionHref(user)}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {quickActionLabel(user)}
                </Link>
                <SettingsSignOutButton />
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
