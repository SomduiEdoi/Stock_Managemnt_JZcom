"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDismiss } from "@/hooks/use-dismiss";
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
import type { RoleCode } from "@/lib/permissions";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import type { SidebarWarehouse } from "@/lib/warehouses";
import { formatWarehouseName } from "@/lib/display-labels";

type StockControllerOption = {
  email: string;
  id: string;
  name: string;
  position: string | null;
};

type AppSidebarProps = {
  approvalCount: number;
  pendingProjectCount: number;
  warehouses: SidebarWarehouse[];
  requestCount: number;
  roles: RoleCode[];
  stockControllers: StockControllerOption[];
};

type WarehouseFormState = {
  controllerId: string;
  headControllerIds: string[];
  warehouseName: string;
  prefix: string;
};

type WarehouseDialogState =
  | { type: "ADD" }
  | { warehouse: SidebarWarehouse; type: "DELETE" }
  | { warehouse: SidebarWarehouse; type: "EDIT" }
  | null;

function getWarehouseHref(warehouseCode: string) {
  if (warehouseCode === "SERVER") {
    return "/dashboard/server";
  }

  if (warehouseCode === "NETWORK") {
    return "/dashboard/network";
  }

  return `/dashboard/inventory/${encodeURIComponent(warehouseCode)}`;
}

function isInventoryPath(pathname: string) {
  return (
    pathname === "/dashboard/server" ||
    pathname === "/dashboard/network" ||
    pathname.startsWith("/dashboard/inventory/") ||
    pathname.startsWith("/dashboard/assets")
  );
}

function isWarehouseActive(pathname: string, warehouseCode: string) {
  if (warehouseCode === "SERVER") {
    return pathname === "/dashboard/server";
  }

  if (warehouseCode === "NETWORK") {
    return pathname === "/dashboard/network";
  }

  return pathname === `/dashboard/inventory/${warehouseCode}`;
}

function canShowRequest(roles: RoleCode[]) {
  return roles.includes("USER");
}

function canShowUsers(roles: RoleCode[]) {
  return roles.includes("ADMIN");
}

function canShowProjects(roles: RoleCode[]) {
  return roles.includes("ADMIN") || roles.includes("STOREMAN") || roles.includes("USER");
}

function canCreateWarehouse(roles: RoleCode[]) {
  return roles.includes("ADMIN");
}

function canManageWarehouses(roles: RoleCode[]) {
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

function emptyWarehouseForm(): WarehouseFormState {
  return {
    controllerId: "",
    headControllerIds: [],
    warehouseName: "",
    prefix: "",
  };
}

function stockControllerOptions(
  stockControllers: StockControllerOption[],
) {
  return stockControllers
    .map((controller) => ({
      description: controller.position ?? "",
      label: controller.name,
      searchText: `${controller.name} ${controller.position ?? ""}`,
      value: controller.id,
    }));
}

function AddWarehouseModal({
  onCreated,
  onClose,
  stockControllers,
}: {
  onCreated: (warehouse: SidebarWarehouse) => void;
  onClose: () => void;
  stockControllers: StockControllerOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<WarehouseFormState>(emptyWarehouseForm());
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<Key extends keyof WarehouseFormState>(key: Key, value: WarehouseFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controllerId: form.controllerId,
          headControllerId: form.headControllerIds[0] ?? null,
          headControllerIds: form.headControllerIds,
          warehouseName: form.warehouseName.trim(),
          prefix: form.prefix.trim().toUpperCase(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Unable to create warehouse.");
        setIsSubmitting(false);
        return;
      }

      const createdWarehouse = data.warehouse as SidebarWarehouse | undefined;
      if (createdWarehouse) {
        onCreated(createdWarehouse);
      }

      router.push(createdWarehouse ? getWarehouseHref(createdWarehouse.code) : "/dashboard");
      router.refresh();
      onClose();
    } catch {
      setError("Unable to create warehouse right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-2xl rounded-md border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Add Warehouse</h2>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Warehouse Name" required>
            <input
              className={inputClass()}
              onChange={(event) => setField("warehouseName", event.target.value)}
              type="text"
              value={form.warehouseName}
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

          <Field label="Warehouse Manager">
            <SearchableDropdown
              multiple
              onChange={(value) => setField("headControllerIds", value)}
              options={stockControllerOptions(stockControllers)}
              placeholder="Select warehouse manager"
              searchPlaceholder="Search user..."
              value={form.headControllerIds}
            />
          </Field>

          <Field label="Storeman" required>
            <SearchableDropdown
              onChange={(value) => setField("controllerId", value)}
              options={stockControllerOptions(stockControllers)}
              placeholder="Select storeman"
              searchPlaceholder="Search user..."
              value={form.controllerId}
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
            {isSubmitting ? "Creating..." : "Create Warehouse"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditWarehouseModal({
  warehouse,
  onClose,
  onUpdated,
  stockControllers,
}: {
  warehouse: SidebarWarehouse;
  onClose: () => void;
  onUpdated: (warehouse: SidebarWarehouse) => void;
  stockControllers: StockControllerOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<WarehouseFormState>({
    controllerId: warehouse.controllerId ?? "",
    headControllerIds: warehouse.headControllerIds ?? (warehouse.headControllerId ? [warehouse.headControllerId] : []),
    warehouseName: warehouse.name,
    prefix: warehouse.prefix,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<Key extends keyof WarehouseFormState>(key: Key, value: WarehouseFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/warehouses/${encodeURIComponent(warehouse.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controllerId: form.controllerId,
          headControllerId: form.headControllerIds[0] ?? null,
          headControllerIds: form.headControllerIds,
          warehouseName: form.warehouseName.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Unable to update warehouse.");
        setIsSubmitting(false);
        return;
      }

      onUpdated(data.warehouse as SidebarWarehouse);
      router.refresh();
      onClose();
    } catch {
      setError("Unable to update warehouse right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-xl rounded-md border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Edit Warehouse</h2>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Warehouse Name" required>
            <input
              className={inputClass()}
              onChange={(event) => setField("warehouseName", event.target.value)}
              type="text"
              value={form.warehouseName}
            />
          </Field>

          <Field label="Prefix">
            <input
              className={inputClass(true)}
              disabled
              title="Prefix is locked after warehouse creation."
              type="text"
              value={form.prefix}
            />
          </Field>

          <Field label="Warehouse Manager">
            <SearchableDropdown
              multiple
              onChange={(value) => setField("headControllerIds", value)}
              options={stockControllerOptions(stockControllers)}
              placeholder="Select warehouse manager"
              searchPlaceholder="Search user..."
              value={form.headControllerIds}
            />
          </Field>

          <Field label="Storeman" required>
            <SearchableDropdown
              onChange={(value) => setField("controllerId", value)}
              options={stockControllerOptions(stockControllers)}
              placeholder="Select storeman"
              searchPlaceholder="Search user..."
              value={form.controllerId}
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

function DeleteWarehouseModal({
  warehouse,
  onClose,
  onDeleted,
}: {
  warehouse: SidebarWarehouse;
  onClose: () => void;
  onDeleted: (warehouse: SidebarWarehouse) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAssets = warehouse.assetCount > 0;

  async function handleDelete() {
    if (hasAssets) {
      setError(
        `This warehouse currently contains ${warehouse.assetCount.toLocaleString("en-US")} assets. Please delete all assets in this warehouse before deleting the warehouse.`,
      );
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/warehouses/${encodeURIComponent(warehouse.code)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message ?? "Unable to delete warehouse.");
        setIsSubmitting(false);
        return;
      }

      onDeleted(warehouse);
      router.push("/dashboard");
      router.refresh();
      onClose();
    } catch {
      setError("Unable to delete warehouse right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Delete Warehouse</h2>
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
            Warehouse: <span className="font-bold text-navy">{formatWarehouseName(warehouse.name)}</span>
          </p>
          <div className="flex gap-3 rounded-md border border-status-fail/20 bg-status-fail/10 p-4 text-sm font-semibold text-status-fail">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>
              This warehouse currently contains {warehouse.assetCount.toLocaleString("en-US")} assets.
              {hasAssets
                ? " Please delete all assets in this warehouse before deleting the warehouse."
                : null}
            </p>
          </div>
          {hasAssets ? null : (
            <p className="text-sm font-medium text-ink">
              Are you sure you want to delete this warehouse?
            </p>
          )}

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
            disabled={hasAssets || isSubmitting}
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
  approvalCount,
  pendingProjectCount,
  warehouses,
  requestCount,
  roles,
  stockControllers,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [isInventoryOpen, setIsInventoryOpen] = useState(true);
  const [warehouseDialog, setWarehouseDialog] = useState<WarehouseDialogState>(null);
  const [openWarehouseMenu, setOpenWarehouseMenu] = useState<string | null>(null);
  const warehouseMenuRef = useRef<HTMLDivElement>(null);
  useDismiss(openWarehouseMenu !== null, () => setOpenWarehouseMenu(null), [warehouseMenuRef]);
  const [warehouseItems, setWarehouseItems] = useState(warehouses);

  useEffect(() => {
    setWarehouseItems(warehouses);
  }, [warehouses]);

  const visibleWarehouses = useMemo(() => {
    return [...warehouseItems].sort((left, right) => left.name.localeCompare(right.name, "en"));
  }, [warehouseItems]);
  const showWarehouseActions = canManageWarehouses(roles);

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
              Warehouse
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
                <span>Warehouses</span>
                <ChevronDown
                  className={clsx("ml-auto h-4 w-4 transition", isInventoryOpen && "rotate-180")}
                />
              </button>

              {isInventoryOpen ? (
                <div className="space-y-1 px-3 pb-3 pt-1">
                  <div className="ml-[7px] border-l border-border pl-4">
                    {visibleWarehouses.map((warehouse) => {
                      const href = getWarehouseHref(warehouse.code);
                      const active = isWarehouseActive(pathname, warehouse.code);

                      return (
                        <div
                          className={clsx(
                            "group relative mt-1 flex min-h-9 items-center rounded-md text-sm font-medium transition",
                            active
                              ? "bg-navy text-white"
                              : "text-muted-foreground hover:bg-surface hover:text-navy",
                          )}
                          key={warehouse.code}
                          ref={openWarehouseMenu === warehouse.code ? warehouseMenuRef : undefined}
                        >
                          <Link className="min-w-0 flex-1 px-3 py-2" href={href}>
                            <span className="block truncate">{formatWarehouseName(warehouse.name)}</span>
                          </Link>

                          {showWarehouseActions ? (
                            <button
                              aria-label={`Open actions for ${warehouse.name}`}
                              className={clsx(
                                "mr-1 flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition hover:bg-white/20 group-hover:opacity-100",
                                openWarehouseMenu === warehouse.code && "opacity-100",
                              )}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenWarehouseMenu((current) =>
                                  current === warehouse.code ? null : warehouse.code,
                                );
                              }}
                              type="button"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          ) : null}

                          {openWarehouseMenu === warehouse.code ? (
                            <div className="absolute right-0 top-9 z-20 w-40 rounded-md border border-border bg-white p-1 text-ink shadow-lg">
                              <button
                                className="block w-full rounded px-3 py-2 text-left text-sm font-semibold hover:bg-surface"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOpenWarehouseMenu(null);
                                  setWarehouseDialog({ warehouse, type: "EDIT" });
                                }}
                                type="button"
                              >
                                Edit Warehouse
                              </button>
                              <button
                                className="block w-full rounded px-3 py-2 text-left text-sm font-semibold text-status-fail hover:bg-status-fail/10"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOpenWarehouseMenu(null);
                                  setWarehouseDialog({ warehouse, type: "DELETE" });
                                }}
                                type="button"
                              >
                                Delete Warehouse
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {canCreateWarehouse(roles) ? (
                      <button
                        className="mt-2 flex min-h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-brand-accent transition hover:bg-brand-accent/10"
                        onClick={() => setWarehouseDialog({ type: "ADD" })}
                        type="button"
                      >
                        <PlusCircle className="h-4 w-4 shrink-0" />
                        <span>Warehouses</span>
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
                  <span className="ml-auto rounded-full bg-brand-accent px-2 py-0.5 text-[11px] font-bold text-white">
                    {requestCount}
                  </span>
                ) : null}
              </SidebarLink>
            ) : null}

            <SidebarLink active={pathname === "/logs"} href="/logs">
              <ReceiptText className="h-4 w-4 shrink-0" />
              <span>Transaction Log</span>
              {approvalCount > 0 ? (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-status-fail px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white">
                  {approvalCount}
                </span>
              ) : null}
            </SidebarLink>

            {canShowProjects(roles) ? (
              <SidebarLink active={pathname === "/project"} href="/project">
                <Layers className="h-4 w-4 shrink-0" />
                <span>Project</span>
                {pendingProjectCount > 0 ? <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-status-fail px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white">{pendingProjectCount}</span> : null}
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

      {warehouseDialog?.type === "ADD" ? (
        <AddWarehouseModal
          onCreated={(warehouse) => {
            setWarehouseItems((current) => {
              if (current.some((item) => item.code === warehouse.code)) {
                return current;
              }

              return [...current, warehouse];
            });
          }}
          onClose={() => setWarehouseDialog(null)}
          stockControllers={stockControllers}
        />
      ) : null}

      {warehouseDialog?.type === "EDIT" ? (
        <EditWarehouseModal
          warehouse={warehouseDialog.warehouse}
          onClose={() => setWarehouseDialog(null)}
          onUpdated={(warehouse) => {
            setWarehouseItems((current) =>
              current.map((item) => (item.code === warehouse.code ? warehouse : item)),
            );
          }}
          stockControllers={stockControllers}
        />
      ) : null}

      {warehouseDialog?.type === "DELETE" ? (
        <DeleteWarehouseModal
          warehouse={warehouseDialog.warehouse}
          onClose={() => setWarehouseDialog(null)}
          onDeleted={(warehouse) => {
            setWarehouseItems((current) => current.filter((item) => item.code !== warehouse.code));
          }}
        />
      ) : null}
    </>
  );
}


