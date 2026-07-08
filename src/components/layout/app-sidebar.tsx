"use client";

import { AssetTrackMethod } from "@prisma/client";
import { clsx } from "clsx";
import {
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  Loader2,
  Package,
  PlusCircle,
  ScrollText,
  Settings,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { RoleCode } from "@/lib/permissions";

type SidebarDomain = {
  code: string;
  name: string;
};

type StockControllerOption = {
  email: string;
  id: string;
  name: string;
};

type AppSidebarProps = {
  domains: SidebarDomain[];
  requestCount: number;
  roles: RoleCode[];
  stockControllers: StockControllerOption[];
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

type CreateDomainForm = {
  categoryName: string;
  controllerId: string;
  domainName: string;
  prefix: string;
  trackMethod: AssetTrackMethod;
  typeCode: string;
  typeName: string;
};

const emptyDomainForm: CreateDomainForm = {
  categoryName: "",
  controllerId: "",
  domainName: "",
  prefix: "",
  trackMethod: AssetTrackMethod.SERIAL,
  typeCode: "",
  typeName: "",
};

function domainHref(code: string) {
  if (code === "SERVER") return "/dashboard/server";
  if (code === "NETWORK") return "/dashboard/network";
  return `/dashboard/inventory/${encodeURIComponent(code)}`;
}

function isInventoryPath(pathname: string) {
  return (
    pathname.startsWith("/dashboard/server") ||
    pathname.startsWith("/dashboard/network") ||
    pathname.startsWith("/dashboard/inventory")
  );
}

function canRequest(roles: RoleCode[]) {
  return roles.includes("USER");
}

function getSecondaryItems(roles: RoleCode[]): TopNavItem[] {
  const items: TopNavItem[] = [
    { href: "/logs", icon: ScrollText, id: "logs", label: "Transaction Log" },
    { href: "/dashboard/settings", icon: Settings, id: "settings", label: "Settings" },
  ];

  if (canRequest(roles)) {
    items.splice(0, 0, { href: "/request", icon: ShoppingCart, id: "request", label: "Request Cart" });
  }

  if (roles.includes("ADMIN")) {
    items.splice(items.length - 1, 0, { href: "/user", icon: Users, id: "users", label: "User" });
  }

  return items;
}

function isActiveItem(item: NavItem, pathname: string) {
  if (item.id === "dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/assets" || pathname === "/dashboard/problem-items";
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
    isActive ? "bg-navy text-white shadow-sm" : "text-muted-foreground hover:bg-surface hover:text-navy",
    disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
    className,
  );

  if (disabled) return <span className={baseClassName}>{children}</span>;

  return (
    <Link className={baseClassName} href={href}>
      {children}
    </Link>
  );
}

function TopNavLink({ item, pathname, requestCount }: { item: TopNavItem; pathname: string; requestCount: number }) {
  const Icon = item.icon;
  const isActive = isActiveItem(item, pathname);
  const showRequestBadge = item.id === "request" && requestCount > 0;

  return (
    <SidebarLink href={item.href} isActive={isActive}>
      <Icon className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
      {showRequestBadge ? (
        <span className="ml-auto rounded-full bg-[#FE7743] px-2 py-0.5 text-[11px] font-bold text-white">{requestCount}</span>
      ) : null}
    </SidebarLink>
  );
}

function CreateDomainModal({
  controllers,
  isOpen,
  onClose,
}: {
  controllers: StockControllerOption[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CreateDomainForm>(emptyDomainForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  function setField<Key extends keyof CreateDomainForm>(key: Key, value: CreateDomainForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate() {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/domains", {
        body: JSON.stringify(form),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { domain?: SidebarDomain; message?: string };

      if (!response.ok || !data.domain) {
        throw new Error(data.message ?? "Unable to create domain.");
      }

      setForm(emptyDomainForm);
      onClose();
      router.push(domainHref(data.domain.code));
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to create domain.";
      setError(message);
      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section className="w-full max-w-xl rounded-md border border-border bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Add Domain</h2>
          <button className="rounded-md p-2 text-muted-foreground hover:bg-surface" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Domain Name
            <input className="h-11 rounded-md border border-border px-3 text-sm font-semibold text-ink outline-none focus:ring-4 focus:ring-brand-accent/20" onChange={(event) => setField("domainName", event.target.value)} placeholder="Deliver Client" value={form.domainName} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Prefix
            <input className="h-11 rounded-md border border-border px-3 text-sm font-semibold uppercase text-ink outline-none focus:ring-4 focus:ring-brand-accent/20" maxLength={2} onChange={(event) => setField("prefix", event.target.value.toUpperCase())} placeholder="DC" value={form.prefix} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Category
            <input className="h-11 rounded-md border border-border px-3 text-sm font-semibold text-ink outline-none focus:ring-4 focus:ring-brand-accent/20" onChange={(event) => setField("categoryName", event.target.value)} placeholder="Equipment" value={form.categoryName} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Type
            <input className="h-11 rounded-md border border-border px-3 text-sm font-semibold text-ink outline-none focus:ring-4 focus:ring-brand-accent/20" onChange={(event) => setField("typeName", event.target.value)} placeholder="Client" value={form.typeName} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Type Prefix
            <input className="h-11 rounded-md border border-border px-3 text-sm font-semibold uppercase text-ink outline-none focus:ring-4 focus:ring-brand-accent/20" maxLength={2} onChange={(event) => setField("typeCode", event.target.value.toUpperCase())} placeholder="CL" value={form.typeCode} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Tracking Method
            <select className="h-11 rounded-md border border-border px-3 text-sm font-semibold text-ink outline-none focus:ring-4 focus:ring-brand-accent/20" onChange={(event) => setField("trackMethod", event.target.value as AssetTrackMethod)} value={form.trackMethod}>
              <option value={AssetTrackMethod.SERIAL}>Serial</option>
              <option value={AssetTrackMethod.QUANTITY}>Quantity</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground md:col-span-2">
            Stock Controller
            <select className="h-11 rounded-md border border-border px-3 text-sm font-semibold text-ink outline-none focus:ring-4 focus:ring-brand-accent/20" onChange={(event) => setField("controllerId", event.target.value)} value={form.controllerId}>
              <option value="">Select stock controller</option>
              {controllers.map((controller) => (
                <option key={controller.id} value={controller.id}>{controller.name} / {controller.email}</option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="px-5 pb-2 text-sm font-semibold text-status-fail">{error}</p> : null}

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button className="h-10 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy" onClick={onClose} type="button">Cancel</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white disabled:opacity-60" disabled={isSaving} onClick={handleCreate} type="button">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            Create Domain
          </button>
        </footer>
      </section>
    </div>
  );
}

function InventoryMenu({
  domains,
  isAdmin,
  pathname,
  stockControllers,
}: {
  domains: SidebarDomain[];
  isAdmin: boolean;
  pathname: string;
  stockControllers: StockControllerOption[];
}) {
  const [isOpen, setIsOpen] = useState(() => isInventoryPath(pathname));
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const hasActiveChild = domains.some((domain) => isActiveItem({ href: domainHref(domain.code), id: domain.code, label: domain.name }, pathname));

  return (
    <div className="flex flex-col gap-1">
      <button className={clsx("flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm font-bold transition", hasActiveChild ? "text-navy" : "text-muted-foreground hover:bg-surface hover:text-navy")} onClick={() => setIsOpen((current) => !current)} type="button">
        <ClipboardCheck className="h-5 w-5 shrink-0" />
        <span>Inventories</span>
        <ChevronDown className={clsx("ml-auto h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div className="ml-[21px] flex flex-col gap-1 border-l border-border pl-4">
          {domains.map((domain) => {
            const href = domainHref(domain.code);
            const isActive = isActiveItem({ href, id: domain.code, label: domain.name }, pathname);

            return (
              <SidebarLink className={clsx("h-9 px-2 text-base font-medium", isActive && "bg-transparent text-navy shadow-none")} href={href} isActive={false} key={domain.code}>
                <span>{domain.name}</span>
              </SidebarLink>
            );
          })}
          {isAdmin ? (
            <button className="flex h-9 items-center gap-3 rounded-md px-2 text-left text-base font-medium text-[#B43A0B] transition hover:bg-surface" onClick={() => setIsDomainModalOpen(true)} type="button">
              <PlusCircle className="h-5 w-5 shrink-0" />
              <span>Domains</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <CreateDomainModal controllers={stockControllers} isOpen={isDomainModalOpen} onClose={() => setIsDomainModalOpen(false)} />
    </div>
  );
}

export function AppSidebar({ domains, requestCount, roles, stockControllers }: AppSidebarProps) {
  const pathname = usePathname();
  const secondaryItems = getSecondaryItems(roles);
  const isAdmin = roles.includes("ADMIN");

  return (
    <aside className="flex border-b border-border bg-white lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex w-full gap-4 overflow-x-auto px-4 py-4 lg:h-screen lg:flex-col lg:overflow-visible lg:px-5 lg:py-6">
        <Link className="flex min-w-[190px] items-center gap-3 rounded-md text-navy lg:min-w-0" href="/dashboard">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white"><Package className="h-5 w-5" /></span>
          <span className="text-lg font-bold leading-5">Stock<br />Management</span>
        </Link>

        <nav className="flex shrink-0 gap-2 lg:mt-6 lg:flex-col">
          <SidebarLink href="/dashboard" isActive={isActiveItem({ href: "/dashboard", id: "dashboard", label: "Dashboard" }, pathname)}>
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <span>Dashboard</span>
          </SidebarLink>

          <InventoryMenu domains={domains} isAdmin={isAdmin} pathname={pathname} stockControllers={stockControllers} />

          {secondaryItems.map((item) => <TopNavLink item={item} key={item.id} pathname={pathname} requestCount={requestCount} />)}
        </nav>
      </div>
    </aside>
  );
}
