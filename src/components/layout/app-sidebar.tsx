"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  Network,
  Package,
  ScrollText,
  Server,
  Users,
} from "lucide-react";
import { clsx } from "clsx";
import type { RoleCode } from "@/lib/permissions";

type AppSidebarProps = {
  roles: RoleCode[];
  requestCount: number;
};

type NavItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  label: string;
};

const dashboardItem: NavItem = {
  href: "/dashboard",
  icon: LayoutDashboard,
  id: "dashboard",
  label: "Dashboard",
};

const baseItems: NavItem[] = [
  {
    href: "/dashboard/server",
    icon: Server,
    id: "server",
    label: "Server",
  },
  {
    href: "/dashboard/network",
    icon: Network,
    id: "network",
    label: "Network",
  },
  {
    href: "/logs",
    icon: ScrollText,
    id: "logs",
    label: "Logs",
  },
];

function getRoleNavItems(roles: RoleCode[]) {
  if (roles.includes("ADMIN")) {
    return [dashboardItem, ...baseItems, { href: "/user", icon: Users, id: "users", label: "User" }];
  }

  if (
    roles.includes("STAFF") ||
    roles.includes("SERVER_OWNER") ||
    roles.includes("NETWORK_OWNER")
  ) {
    return [
      dashboardItem,
      ...baseItems,
      {
        href: "/request",
        icon: ClipboardList,
        id: "request",
        label: "Request",
      },
    ];
  }

  return [dashboardItem, ...baseItems];
}

function isActiveItem(item: NavItem, pathname: string) {
  if (item.id === "dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/assets";
  }

  if (item.id === "server") {
    return pathname === "/dashboard/server";
  }

  if (item.id === "network") {
    return pathname === "/dashboard/network";
  }

  return pathname === item.href;
}

function NavLink({
  item,
  pathname,
  requestCount,
}: {
  item: NavItem;
  pathname: string;
  requestCount: number;
}) {
  const Icon = item.icon;
  const isActive = isActiveItem(item, pathname);
  const showRequestBadge = item.id === "request" && requestCount > 0;

  return (
    <Link
      className={clsx(
        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition",
        isActive
          ? "bg-navy text-white shadow-sm"
          : "text-muted-foreground hover:bg-surface hover:text-navy",
      )}
      href={item.href}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
      {showRequestBadge ? (
        <span className="ml-auto rounded-full bg-[#FE7743] px-2 py-0.5 text-[11px] font-bold text-white">
          {requestCount}
        </span>
      ) : null}
    </Link>
  );
}

export function AppSidebar({ requestCount, roles }: AppSidebarProps) {
  const pathname = usePathname();
  const items = getRoleNavItems(roles);

  return (
    <aside className="flex border-b border-border bg-white lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex w-full gap-4 overflow-x-auto px-4 py-4 lg:h-screen lg:flex-col lg:overflow-visible lg:px-5 lg:py-6">
        <Link
          className="flex min-w-[190px] items-center gap-3 rounded-md text-navy lg:min-w-0"
          href="/dashboard"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
            <Package className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold leading-5">
            Stock
            <br />
            Management
          </span>
        </Link>

        <nav className="flex shrink-0 gap-2 lg:mt-6 lg:flex-col">
          {items.map((item) => (
            <NavLink
              item={item}
              key={item.id}
              pathname={pathname}
              requestCount={requestCount}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
