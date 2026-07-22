"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  Archive,
  LayoutDashboard,
  Layers,
  MoreVertical,
  Package,
  PlusCircle,
  ReceiptText,
  ShoppingBasket,
  UserRound,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { AssetTrackMethod } from "@prisma/client";
import type { RoleCode } from "@/lib/permissions";
import type { SidebarDomain } from "@/lib/domains";

type StockControllerOption = {
  email: string;
  id: string;
  name: string;
  stockControllerTag: string | null;
};

type AppSidebarProps = {
  domains: SidebarDomain[];
  requestCount: number;
  roles: RoleCode[];
  stockControllers: StockControllerOption[];
};

type DomainFormState = {
  controllerId: string;
  headControllerId: string;
  domainName: string;
  prefix: string;
  trackMethod: AssetTrackMethod;
};

type DomainDialogState =
  | { type: "ADD" }
  | { domain: SidebarDomain; type: "DELETE" }
  | { domain: SidebarDomain; type: "EDIT" }
  | null;

function getDomainHref(domainCode: string) {
  if (domainCode === "SERVER") {
    return "/dashboard/server";
  }

  if (domainCode === "NETWORK") {
    return "/dashboard/network";
  }

  return `/dashboard/inventory/${encodeURIComponent(domainCode)}`;
}

function isInventoryPath(pathname: string) {
  return (
    pathname === "/dashboard/server" ||
    pathname === "/dashboard/network" ||
    pathname.startsWith("/dashboard/inventory/") ||
    pathname.startsWith("/dashboard/assets")
  );
}

function isDomainActive(pathname: string, domainCode: string) {
  if (domainCode === "SERVER") {
    return pathname === "/dashboard/server";
  }

  if (domainCode === "NETWORK") {
    return pathname === "/dashboard/network";
  }

  return pathname === `/dashboard/inventory/${domainCode}`;
}

function canShowRequest(roles: RoleCode[]) {
  return roles.includes("USER");
}

function canShowUsers(roles: RoleCode[]) {
  return roles.includes("ADMIN");
}

function canShowProjects(roles: RoleCode[]) {
  return roles.includes("ADMIN");
}

function canCreateDomain(roles: RoleCode[]) {
  return roles.includes("ADMIN");
}

function canManageDomains(roles: RoleCode[]) {
  return roles.includes("ADMIN");
}

function inputClass(disabled = false) {
  return clsx(
    "h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-medium text-ink outline-none ring-brand-accent/20 transition focus:ring-4",
    disabled && "cursor-not-allowed bg-surface text-muted-foreground",
  );
}

function Field({
  children,
  label,
  required = false,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-navy">
        {label}
        {required ? <span className="ml-1 text-status-fail">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function emptyDomainForm(): DomainFormState {
  return {
    controllerId: "",
    headControllerId: "",
    domainName: "",
    prefix: "",
    trackMethod: AssetTrackMethod.SERIAL,
  };
}

function inventoryFamilyLabel(value: AssetTrackMethod) {
  return value === AssetTrackMethod.QUANTITY ? "Quantity" : "Serial";
}

function AddDomainModal({
  onCreated,
  onClose,
  stockControllers,
}: {
  onCreated: (domain: SidebarDomain) => void;
  onClose: () => void;
  stockControllers: StockControllerOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<DomainFormState>(emptyDomainForm());
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<Key extends keyof DomainFormState>(key: Key, value: DomainFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controllerId: form.controllerId,
          headControllerId: form.headControllerId || null,
          domainName: form.domainName.trim(),
          prefix: form.prefix.trim().toUpperCase(),
          trackMethod: form.trackMethod,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Unable to create domain.");
        setIsSubmitting(false);
        return;
      }

      const createdDomain = data.domain as SidebarDomain | undefined;
      if (createdDomain) {
        onCreated(createdDomain);
      }

      router.push(createdDomain ? getDomainHref(createdDomain.code) : "/dashboard");
      router.refresh();
      onClose();
    } catch {
      setError("Unable to create domain right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-2xl rounded-md border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Add Domain</h2>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Domain Name" required>
            <input
              className={inputClass()}
              onChange={(event) => setField("domainName", event.target.value)}
              type="text"
              value={form.domainName}
            />
          </Field>

          <Field label="Prefix" required>
            <input
              className={inputClass()}
              maxLength={2}
              onChange={(event) => setField("prefix", event.target.value.toUpperCase())}
              type="text"
              value={form.prefix}
            />
          </Field>

          <Field label="Inventory Family" required>
            <select
              className={inputClass()}
              onChange={(event) => setField("trackMethod", event.target.value as AssetTrackMethod)}
              value={form.trackMethod}
            >
              <option value={AssetTrackMethod.SERIAL}>Serial</option>
              <option value={AssetTrackMethod.QUANTITY}>Quantity</option>
            </select>
          </Field>

          <Field label="Stock Controller" required>
            <select
              className={inputClass()}
              onChange={(event) => setField("controllerId", event.target.value)}
              value={form.controllerId}
            >
              <option value="">Select stock controller</option>
              {stockControllers.map((controller) => (
                <option key={controller.id} value={controller.id}>
                  {controller.name} ({controller.email})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Head Stock Controller">
            <select
              className={inputClass()}
              onChange={(event) => setField("headControllerId", event.target.value)}
              value={form.headControllerId}
            >
              <option value="">No head stock controller</option>
              {stockControllers.map((controller) => (
                <option key={controller.id} value={controller.id}>
                  {controller.name} ({controller.email})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error ? (
          <div className="mx-5 rounded-md border border-status-fail/20 bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 px-5 py-5">
          <button
            className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? "Creating..." : "Create Domain"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDomainModal({
  domain,
  onClose,
  onUpdated,
  stockControllers,
}: {
  domain: SidebarDomain;
  onClose: () => void;
  onUpdated: (domain: SidebarDomain) => void;
  stockControllers: StockControllerOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<DomainFormState>({
    controllerId: domain.controllerId ?? "",
    headControllerId: domain.headControllerId ?? "",
    domainName: domain.name,
    prefix: domain.prefix,
    trackMethod: domain.inventoryFamily,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<Key extends keyof DomainFormState>(key: Key, value: DomainFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/domains/${encodeURIComponent(domain.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controllerId: form.controllerId,
          headControllerId: form.headControllerId || null,
          domainName: form.domainName.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Unable to update domain.");
        setIsSubmitting(false);
        return;
      }

      onUpdated(data.domain as SidebarDomain);
      router.refresh();
      onClose();
    } catch {
      setError("Unable to update domain right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-xl rounded-md border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Edit Domain</h2>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Domain Name" required>
            <input
              className={inputClass()}
              onChange={(event) => setField("domainName", event.target.value)}
              type="text"
              value={form.domainName}
            />
          </Field>

          <Field label="Prefix">
            <input
              aria-readonly="true"
              className={inputClass(true)}
              readOnly
              title="Prefix is locked after domain creation. New stock codes will continue using this prefix."
              type="text"
              value={form.prefix}
            />
          </Field>

          <Field label="Stock Controller" required>
            <select
              className={inputClass()}
              onChange={(event) => setField("controllerId", event.target.value)}
              value={form.controllerId}
            >
              <option value="">Select stock controller</option>
              {stockControllers.map((controller) => (
                <option key={controller.id} value={controller.id}>
                  {controller.name} ({controller.email})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Head Stock Controller">
            <select
              className={inputClass()}
              onChange={(event) => setField("headControllerId", event.target.value)}
              value={form.headControllerId}
            >
              <option value="">No head stock controller</option>
              {stockControllers.map((controller) => (
                <option key={controller.id} value={controller.id}>
                  {controller.name} ({controller.email})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Inventory Family">
            <input
              className={inputClass(true)}
              disabled
              type="text"
              value={inventoryFamilyLabel(form.trackMethod)}
            />
          </Field>
        </div>

        {error ? (
          <div className="mx-5 rounded-md border border-status-fail/20 bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 px-5 py-5">
          <button
            className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteDomainModal({
  domain,
  onClose,
  onDeleted,
}: {
  domain: SidebarDomain;
  onClose: () => void;
  onDeleted: (domain: SidebarDomain) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDelete() {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/domains/${encodeURIComponent(domain.code)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message ?? "Unable to delete domain.");
        setIsSubmitting(false);
        return;
      }

      onDeleted(domain);
      router.push("/dashboard");
      router.refresh();
      onClose();
    } catch {
      setError("Unable to delete domain right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Delete Domain</h2>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm font-semibold text-ink">
            Domain: <span className="font-bold text-navy">{domain.name}</span>
          </p>
          <div className="flex gap-3 rounded-md border border-status-fail/20 bg-status-fail/10 p-4 text-sm font-semibold text-status-fail">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>This domain currently contains {domain.assetCount.toLocaleString("en-US")} assets.</p>
          </div>
          <p className="text-sm font-medium text-ink">
            Are you sure you want to delete this domain?
          </p>

          {error ? (
            <div className="rounded-md border border-status-fail/20 bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-5">
          <button
            className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-md bg-status-fail px-4 text-sm font-bold text-white hover:bg-status-fail/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={handleDelete}
            type="button"
          >
            {isSubmitting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      className={clsx(
        "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition",
        active
          ? "bg-navy text-white shadow-sm"
          : "text-muted-foreground hover:bg-surface hover:text-navy",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

export function AppSidebar({
  domains,
  requestCount,
  roles,
  stockControllers,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [isInventoryOpen, setIsInventoryOpen] = useState(true);
  const [domainDialog, setDomainDialog] = useState<DomainDialogState>(null);
  const [openDomainMenu, setOpenDomainMenu] = useState<string | null>(null);
  const [domainItems, setDomainItems] = useState(domains);

  useEffect(() => {
    setDomainItems(domains);
  }, [domains]);

  const visibleDomains = useMemo(() => {
    return [...domainItems].sort((left, right) => left.name.localeCompare(right.name, "en"));
  }, [domainItems]);
  const showDomainActions = canManageDomains(roles);

  return (
    <>
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
            <SidebarLink active={pathname === "/dashboard"} href="/dashboard">
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span>Dashboard</span>
            </SidebarLink>

            <div className="flex flex-col">
              <button
                className={clsx(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition",
                  isInventoryPath(pathname)
                    ? "bg-surface text-navy"
                    : "text-muted-foreground hover:bg-surface hover:text-navy",
                )}
                onClick={() => setIsInventoryOpen((current) => !current)}
                type="button"
              >
                <Archive className="h-4 w-4 shrink-0" />
                <span>Inventories</span>
                <ChevronDown
                  className={clsx("ml-auto h-4 w-4 transition", isInventoryOpen && "rotate-180")}
                />
              </button>

              {isInventoryOpen ? (
                <div className="space-y-1 px-3 pb-3 pt-1">
                  <div className="ml-[7px] border-l border-border pl-4">
                    {visibleDomains.map((domain) => {
                      const href = getDomainHref(domain.code);
                      const active = isDomainActive(pathname, domain.code);

                      return (
                        <div
                          className={clsx(
                            "group relative mt-1 flex min-h-9 items-center rounded-md text-sm font-medium transition",
                            active
                              ? "bg-navy text-white"
                              : "text-muted-foreground hover:bg-surface hover:text-navy",
                          )}
                          key={domain.code}
                        >
                          <Link className="min-w-0 flex-1 px-3 py-2" href={href}>
                            <span className="block truncate">{domain.name}</span>
                          </Link>

                          {showDomainActions ? (
                            <button
                              aria-label={`Open actions for ${domain.name}`}
                              className={clsx(
                                "mr-1 flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition hover:bg-white/20 group-hover:opacity-100",
                                openDomainMenu === domain.code && "opacity-100",
                              )}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenDomainMenu((current) =>
                                  current === domain.code ? null : domain.code,
                                );
                              }}
                              type="button"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          ) : null}

                          {openDomainMenu === domain.code ? (
                            <div className="absolute right-0 top-9 z-20 w-40 rounded-md border border-border bg-white p-1 text-ink shadow-lg">
                              <button
                                className="block w-full rounded px-3 py-2 text-left text-sm font-semibold hover:bg-surface"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOpenDomainMenu(null);
                                  setDomainDialog({ domain, type: "EDIT" });
                                }}
                                type="button"
                              >
                                Edit Domain
                              </button>
                              <button
                                className="block w-full rounded px-3 py-2 text-left text-sm font-semibold text-status-fail hover:bg-status-fail/10"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOpenDomainMenu(null);
                                  setDomainDialog({ domain, type: "DELETE" });
                                }}
                                type="button"
                              >
                                Delete Domain
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {canCreateDomain(roles) ? (
                      <button
                        className="mt-2 flex min-h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-[#B45309] transition hover:bg-[#FE7743]/10"
                        onClick={() => setDomainDialog({ type: "ADD" })}
                        type="button"
                      >
                        <PlusCircle className="h-4 w-4 shrink-0" />
                        <span>Domains</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {canShowRequest(roles) ? (
              <SidebarLink active={pathname === "/request"} href="/request">
                <ShoppingBasket className="h-4 w-4 shrink-0" />
                <span>Request Cart</span>
                {requestCount > 0 ? (
                  <span className="ml-auto rounded-full bg-[#FE7743] px-2 py-0.5 text-[11px] font-bold text-white">
                    {requestCount}
                  </span>
                ) : null}
              </SidebarLink>
            ) : null}

            <SidebarLink active={pathname === "/logs"} href="/logs">
              <ReceiptText className="h-4 w-4 shrink-0" />
              <span>Transaction Log</span>
            </SidebarLink>

            {canShowProjects(roles) ? (
              <SidebarLink active={pathname === "/project"} href="/project">
                <Layers className="h-4 w-4 shrink-0" />
                <span>Project</span>
              </SidebarLink>
            ) : null}

            {canShowUsers(roles) ? (
              <SidebarLink active={pathname === "/user"} href="/user">
                <UserRound className="h-4 w-4 shrink-0" />
                <span>User</span>
              </SidebarLink>
            ) : null}
          </nav>
        </div>
      </aside>

      {domainDialog?.type === "ADD" ? (
        <AddDomainModal
          onCreated={(domain) => {
            setDomainItems((current) => {
              if (current.some((item) => item.code === domain.code)) {
                return current;
              }

              return [...current, domain];
            });
          }}
          onClose={() => setDomainDialog(null)}
          stockControllers={stockControllers}
        />
      ) : null}

      {domainDialog?.type === "EDIT" ? (
        <EditDomainModal
          domain={domainDialog.domain}
          onClose={() => setDomainDialog(null)}
          onUpdated={(domain) => {
            setDomainItems((current) =>
              current.map((item) => (item.code === domain.code ? domain : item)),
            );
          }}
          stockControllers={stockControllers}
        />
      ) : null}

      {domainDialog?.type === "DELETE" ? (
        <DeleteDomainModal
          domain={domainDialog.domain}
          onClose={() => setDomainDialog(null)}
          onDeleted={(domain) => {
            setDomainItems((current) => current.filter((item) => item.code !== domain.code));
          }}
        />
      ) : null}
    </>
  );
}


