"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  Package,
  PlusCircle,
  ScrollText,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { clsx } from "clsx";
import type { RoleCode } from "@/lib/permissions";

type AppSidebarProps = {
  roles: RoleCode[];
  requestCount: number;
};

type NavItem = {
  disabled?: boolean;
  href: string;
  id: string;
  label: string;
};

type TopNavItem = NavItem & {
  icon: React.ComponentType<{ className?: string }>;
};

const inventoryItems: NavItem[] = [
  {
    href: "/dashboard/server",
    id: "server",
    label: "Server",
  },
  {
    href: "/dashboard/network",
    id: "network",
    label: "Network",
  },
  {
    disabled: true,
    href: "#",
    id: "deliver-client",
    label: "Deliver & Client",
  },
  {
    disabled: true,
    href: "#",
    id: "domains",
    label: "Domains",
  },
];

function isInventoryPath(pathname: string) {
  return pathname.startsWith("/dashboard/server") || pathname.startsWith("/dashboard/network");
}

function canRequest(roles: RoleCode[]) {
  return roles.includes("USER");
}

function getSecondaryItems(roles: RoleCode[]): TopNavItem[] {
  const items: TopNavItem[] = [
    {
      href: "/logs",
      icon: ScrollText,
      id: "logs",
      label: "Transaction Log",
    },
    {
      href: "/dashboard/settings",
      icon: Settings,
      id: "settings",
      label: "Settings",
    },
  ];

  if (canRequest(roles)) {
    items.splice(0, 0, {
      href: "/request",
      icon: ShoppingCart,
      id: "request",
      label: "Request Cart",
    });
  }

  if (roles.includes("ADMIN")) {
    items.splice(items.length - 1, 0, {
      href: "/user",
      icon: Users,
      id: "users",
      label: "User",
    });
  }

  return items;
}

function isActiveItem(item: NavItem, pathname: string) {
  if (item.id === "dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/assets" || pathname === "/dashboard/problem-items";
  }

  if (item.id === "server") {
    return pathname.startsWith("/dashboard/server");
  }

  if (item.id === "network") {
    return pathname.startsWith("/dashboard/network");
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SidebarLink({
  children,
  className,
  disabled,
  href,
  isActive,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  href: string;
  isActive?: boolean;
}) {
  const baseClassName = clsx(
    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition",
    isActive
      ? "bg-navy text-white shadow-sm"
      : "text-muted-foreground hover:bg-surface hover:text-navy",
    disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
    className,
  );

  if (disabled) {
    return <span className={baseClassName}>{children}</span>;
  }

  return (
    <Link className={baseClassName} href={href}>
      {children}
    </Link>
  );
}

function TopNavLink({
  item,
  pathname,
  requestCount,
}: {
  item: TopNavItem;
  pathname: string;
  requestCount: number;
}) {
  const Icon = item.icon;
  const isActive = isActiveItem(item, pathname);
  const showRequestBadge = item.id === "request" && requestCount > 0;

  return (
    <SidebarLink href={item.href} isActive={isActive}>
      <Icon className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
      {showRequestBadge ? (
        <span className="ml-auto rounded-full bg-[#FE7743] px-2 py-0.5 text-[11px] font-bold text-white">
          {requestCount}
        </span>
      ) : null}
    </SidebarLink>
  );
}

function InventoryMenu({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(() => isInventoryPath(pathname));
  const hasActiveChild = inventoryItems.some((item) => isActiveItem(item, pathname));

  return (
    <div className="flex flex-col gap-1">
      <button
        className={clsx(
          "flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm font-bold transition",
          hasActiveChild
            ? "text-navy"
            : "text-muted-foreground hover:bg-surface hover:text-navy",
        )}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <ClipboardCheck className="h-5 w-5 shrink-0" />
        <span>Inventories</span>
        <ChevronDown
          className={clsx(
            "ml-auto h-4 w-4 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? (
        <div className="ml-[21px] flex flex-col gap-1 border-l border-border pl-4">
          {inventoryItems.map((item) => {
            const isActive = isActiveItem(item, pathname);
            const isDomains = item.id === "domains";

            return (
              <SidebarLink
                className={clsx(
                  "h-9 px-2 text-base font-medium",
                  isActive && "bg-transparent text-navy shadow-none",
                  isDomains && !item.disabled && "text-[#B43A0B] hover:text-[#B43A0B]",
                  item.disabled && isDomains && "text-[#B43A0B] opacity-80",
                )}
                disabled={item.disabled}
                href={item.href}
                isActive={false}
                key={item.id}
              >
                {isDomains ? <PlusCircle className="h-5 w-5 shrink-0" /> : null}
                <span>{item.label}</span>
              </SidebarLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AppSidebar({ requestCount, roles }: AppSidebarProps) {
  const pathname = usePathname();
  const secondaryItems = getSecondaryItems(roles);

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
          <SidebarLink href="/dashboard" isActive={isActiveItem({ href: "/dashboard", id: "dashboard", label: "Dashboard" }, pathname)}>
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <span>Dashboard</span>
          </SidebarLink>

          <InventoryMenu pathname={pathname} />

          {secondaryItems.map((item) => (
            <TopNavLink
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

