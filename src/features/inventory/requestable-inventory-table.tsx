"use client";

import { AssetStatus } from "@prisma/client";
import { ArrowDownAZ, ArrowUpAZ, CheckCircle2, ChevronDown, Loader2, Package, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import { assetStatusHexColors, assetStatusLabels } from "@/lib/status-style";

export type RequestableInventoryRow = {
  assetModel: {
    assetType?: { trackMethod: "SERIAL" | "QUANTITY" } | null;
    brand: string | null;
    category: { name: string } | null;
    name: string;
    typeName: string | null;
  };
  availableQuantity: number;
  id: string;
  locationText: string | null;
  reservedQuantity: number;
  serialNo: string | null;
  status: AssetStatus;
  stockCode: string | null;
  totalQuantity: number;
};

type SortDirection = "asc" | "desc";

type SortKey =
  | "availability"
  | "brand"
  | "category"
  | "model"
  | "serialNo"
  | "status"
  | "stockCode"
  | "type";

type InventoryFamily = "SERIAL" | "QUANTITY";

type InventoryColumnKey =
  | "availability"
  | "brand"
  | "category"
  | "model"
  | "serialNo"
  | "status"
  | "stockCode"
  | "type";

const serialInventoryColumns: InventoryColumnKey[] = [
  "serialNo",
  "model",
  "category",
  "type",
  "brand",
  "stockCode",
  "status",
];

const quantityInventoryColumns: InventoryColumnKey[] = [
  "stockCode",
  "model",
  "category",
  "type",
  "brand",
  "availability",
  "status",
];

const inventoryColumnLabels = {
  availability: "Availability",
  brand: "Brand",
  category: "Category",
  model: "Model",
  serialNo: "Serial No.",
  status: "Status",
  stockCode: "Stock Code",
  type: "Type",
} as const satisfies Record<InventoryColumnKey, string>;

type RequestableInventoryTableProps = {
  activeSort?: { by: SortKey; direction: SortDirection };
  canRequest: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  domainLabel: string;
  inventoryFamily?: InventoryFamily;
  rows: RequestableInventoryRow[];
  sortLinks?: Partial<Record<SortKey, { asc: string; desc: string }>>;
};

type StatusChangeTarget = {
  asset: RequestableInventoryRow;
  toStatus: AssetStatus;
};

function displayValue(value: string | null | undefined) {
  return value || "-";
}

function SortableHeader({
  activeSort,
  children,
  isOpen,
  onToggle,
  sortKey,
  sortLinks,
}: {
  activeSort?: { by: SortKey; direction: SortDirection };
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  sortKey: SortKey;
  sortLinks?: Partial<Record<SortKey, { asc: string; desc: string }>>;
}) {
  const links = sortLinks?.[sortKey];
  const isActive = activeSort?.by === sortKey;
  const Icon = activeSort?.direction === "desc" ? ArrowDownAZ : ArrowUpAZ;

  if (!links) {
    return <th className="px-5 py-4 font-bold">{children}</th>;
  }

  return (
    <th className="relative px-5 py-4 font-bold">
      <button
        className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm transition hover:text-navy ${
          isActive ? "text-brand-accent" : "text-muted-foreground"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        type="button"
      >
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{children}</span>
        {isActive ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>

      {isOpen ? (
        <div className="absolute left-4 top-[calc(100%-0.35rem)] z-40 w-44 rounded-md border border-border bg-white py-2 text-sm normal-case text-ink shadow-xl">
          <Link
            className="flex items-center gap-2 px-3 py-2 font-semibold transition hover:bg-surface"
            href={links.asc}
          >
            <ArrowUpAZ className="h-4 w-4" />
            A to Z
          </Link>
          <Link
            className="flex items-center gap-2 px-3 py-2 font-semibold transition hover:bg-surface"
            href={links.desc}
          >
            <ArrowDownAZ className="h-4 w-4" />
            Z to A
          </Link>
        </div>
      ) : null}
    </th>
  );
}

function TruncatedCell({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string | null | undefined;
}) {
  const displayTitle = displayValue(title);

  return (
    <td className={`min-w-0 px-5 py-4 ${className}`} title={displayTitle}>
      <div className="overflow-hidden text-ellipsis whitespace-nowrap">
        {children}
      </div>
    </td>
  );
}
function AvailabilityCell({ asset }: { asset: RequestableInventoryRow }) {
  return (
    <td
      className="px-5 py-4"
      title={`${asset.availableQuantity} available, ${asset.reservedQuantity} reserved, ${asset.totalQuantity} total`}
    >
      <div className="min-w-0">
        <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold text-navy">
          {asset.availableQuantity.toLocaleString("en-US")} /{" "}
          {asset.totalQuantity.toLocaleString("en-US")}
        </p>
        {asset.reservedQuantity > 0 ? (
          <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-status-request">
            {asset.reservedQuantity.toLocaleString("en-US")} reserved
          </p>
        ) : (
          <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-muted-foreground">
            Available
          </p>
        )}
      </div>
    </td>
  );
}

function getInventoryColumnValue(
  asset: RequestableInventoryRow,
  columnKey: InventoryColumnKey,
) {
  switch (columnKey) {
    case "brand":
      return asset.assetModel.brand;
    case "category":
      return asset.assetModel.category?.name;
    case "model":
      return asset.assetModel.name;
    case "serialNo":
      return asset.serialNo;
    case "stockCode":
      return asset.stockCode;
    case "type":
      return asset.assetModel.typeName;
    default:
      return null;
  }
}

function InventoryDataCell({
  asset,
  columnKey,
}: {
  asset: RequestableInventoryRow;
  columnKey: InventoryColumnKey;
}) {
  if (columnKey === "availability") {
    return <AvailabilityCell asset={asset} />;
  }

  if (columnKey === "status") {
    return null;
  }

  const value = getInventoryColumnValue(asset, columnKey);

  return (
    <TruncatedCell
      className={columnKey === "model" || columnKey === "serialNo" ? "font-bold text-navy" : "text-ink"}
      title={value}
    >
      {displayValue(value)}
    </TruncatedCell>
  );
}

const manualStatusTransitions = {
  [AssetStatus.READY]: [
    AssetStatus.REQUEST,
    AssetStatus.BORROW,
    AssetStatus.USING,
    AssetStatus.SOLD,
    AssetStatus.FAIL,
    AssetStatus.LOST,
    AssetStatus.NEED_CHECK,
  ],
  [AssetStatus.REQUEST]: [],
  [AssetStatus.BORROW]: [],
  [AssetStatus.USING]: [],
  [AssetStatus.SOLD]: [],
  [AssetStatus.FAIL]: [AssetStatus.READY, AssetStatus.NEED_CHECK],
  [AssetStatus.LOST]: [AssetStatus.READY, AssetStatus.NEED_CHECK],
  [AssetStatus.NEED_CHECK]: [
    AssetStatus.READY,
    AssetStatus.FAIL,
    AssetStatus.LOST,
  ],
} as const satisfies Record<AssetStatus, readonly AssetStatus[]>;

function RequestConfirmDialog({
  asset,
  domainLabel,
  error,
  isSubmitting,
  onClose,
  onConfirm,
  onQuantityChange,
  quantity,
}: {
  asset: RequestableInventoryRow;
  domainLabel: string;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  onQuantityChange: (quantity: number) => void;
  quantity: number;
}) {
  const isReady = asset.status === AssetStatus.READY && asset.availableQuantity > 0;
  const isQuantityAsset = asset.assetModel.assetType?.trackMethod === "QUANTITY";
  const maxQuantity = Math.max(1, asset.availableQuantity);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section className="w-full max-w-lg rounded-md border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-status-request/15 text-status-request">
            <Package className="h-6 w-6" />
          </span>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-5 text-2xl font-bold text-navy">Request this asset?</h2>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {domainLabel} / {asset.assetModel.name}
        </p>

        <div className="mt-6 grid gap-3 rounded-md border border-border bg-surface px-4 py-4 text-sm font-semibold text-ink sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Serial No.</p>
            <p className="mt-1">{displayValue(asset.serialNo)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Brand</p>
            <p className="mt-1">{asset.assetModel.brand ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-1">
              <AssetStatusBadge status={asset.status} />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Available</p>
            <p className="mt-1">
              {asset.availableQuantity.toLocaleString("en-US")} /{" "}
              {asset.totalQuantity.toLocaleString("en-US")}
            </p>
          </div>
        </div>

        {isQuantityAsset ? (
          <label className="mt-5 block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Quantity
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm font-semibold outline-none ring-brand-accent/20 focus:ring-4"
              max={maxQuantity}
              min={1}
              onChange={(event) =>
                onQuantityChange(Number.parseInt(event.target.value, 10) || 1)
              }
              type="number"
              value={quantity}
            />
          </label>
        ) : null}

        {!isReady ? (
          <p className="mt-4 rounded-md bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
            Only READY assets with available quantity can be requested.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-md bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!isReady || isSubmitting}
            onClick={() => onConfirm(quantity)}
            type="button"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Request Asset
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteConfirmDialog({
  asset,
  error,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  asset: RequestableInventoryRow;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section className="w-full max-w-lg rounded-md border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-status-fail/10 text-status-fail">
            <Trash2 className="h-6 w-6" />
          </span>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-5 text-2xl font-bold text-navy">Delete this asset?</h2>

        <div className="mt-6 grid gap-3 rounded-md border border-border bg-surface px-4 py-4 text-sm font-semibold text-ink sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
            <p className="mt-1">{asset.assetModel.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Serial No.</p>
            <p className="mt-1">{displayValue(asset.serialNo)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-1">
              <AssetStatusBadge status={asset.status} />
            </div>
          </div>
        </div>

        <p className="mt-4 rounded-md bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
          This asset will be removed from active inventory.
        </p>

        {error ? (
          <p className="mt-4 rounded-md bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-status-fail px-4 text-sm font-bold text-white hover:bg-status-fail/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete Asset
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusChangeConfirmDialog({
  error,
  isSubmitting,
  note,
  onClose,
  onConfirm,
  onNoteChange,
  target,
}: {
  error: string | null;
  isSubmitting: boolean;
  note: string;
  onClose: () => void;
  onConfirm: () => void;
  onNoteChange: (value: string) => void;
  target: StatusChangeTarget;
}) {
  const { asset, toStatus } = target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section className="w-full max-w-lg rounded-md border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-accent/10 text-brand-accent">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-5 text-2xl font-bold text-navy">Change asset status?</h2>

        <div className="mt-6 grid gap-3 rounded-md border border-border bg-surface px-4 py-4 text-sm font-semibold text-ink sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
            <p className="mt-1">{asset.assetModel.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Serial No.</p>
            <p className="mt-1">{displayValue(asset.serialNo)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Status Change
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AssetStatusBadge status={asset.status} />
              <span className="text-sm font-bold text-muted-foreground">to</span>
              <AssetStatusBadge status={toStatus} />
            </div>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Remark *
          </span>
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Reason for this status change"
            value={note}
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-md bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || note.trim().length === 0}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Change Status
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusMenuCell({
  asset,
  canChangeStatus,
  isOpen,
  onSelect,
  onToggle,
}: {
  asset: RequestableInventoryRow;
  canChangeStatus: boolean;
  isOpen: boolean;
  onSelect: (asset: RequestableInventoryRow, toStatus: AssetStatus) => void;
  onToggle: () => void;
}) {
  const options = manualStatusTransitions[asset.status];

  if (!canChangeStatus || options.length === 0) {
    return <AssetStatusBadge status={asset.status} />;
  }

  return (
    <div className="relative inline-block">
      <button
        className="inline-flex items-center gap-2 rounded-full focus:outline-none focus:ring-4 focus:ring-brand-accent/20"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        type="button"
      >
        <AssetStatusBadge status={asset.status} />
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen ? (
        <div
          className="absolute left-0 top-full z-30 mt-2 w-44 rounded-md border border-border bg-white p-2 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          {options.map((status) => (
            <button
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold text-navy transition hover:bg-surface"
              key={status}
              onClick={() => onSelect(asset, status)}
              type="button"
            >
              <span>{assetStatusLabels[status]}</span>
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: assetStatusHexColors[status] }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RequestableInventoryTable({
  activeSort,
  canDelete,
  canChangeStatus,
  domainLabel,
  inventoryFamily = "SERIAL",
  canRequest,
  rows,
  sortLinks,
}: RequestableInventoryTableProps) {
  const router = useRouter();
  const [activeAsset, setActiveAsset] = useState<RequestableInventoryRow | null>(null);
  const [requestQuantity, setRequestQuantity] = useState(1);
  const [deleteAsset, setDeleteAsset] = useState<RequestableInventoryRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusChange, setStatusChange] = useState<StatusChangeTarget | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMenuAssetId, setStatusMenuAssetId] = useState<string | null>(null);
  const [openSortKey, setOpenSortKey] = useState<SortKey | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const columns = inventoryFamily === "QUANTITY" ? quantityInventoryColumns : serialInventoryColumns;

  const requestableCount = useMemo(
    () =>
      rows.filter(
        (asset) => asset.status === AssetStatus.READY && asset.availableQuantity > 0,
      ).length,
    [rows],
  );

  function openAssetDetail(asset: RequestableInventoryRow) {
    router.push(`/dashboard/assets/${asset.id}`);
  }

  async function handleConfirm(quantity: number) {
    if (!activeAsset) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/requests/hold", {
        body: JSON.stringify({
          items: [
            {
              assetId: activeAsset.id,
              quantity,
            },
          ],
          note: `Requested from ${domainLabel} inventory.`,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to request asset.");
      }

      router.refresh();
      router.push("/request");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request asset.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteAsset) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/assets/${deleteAsset.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to delete asset.");
      }

      setDeleteAsset(null);
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : "Unable to delete asset.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function openStatusChange(asset: RequestableInventoryRow, toStatus: AssetStatus) {
    setStatusMenuAssetId(null);
    setStatusChange({ asset, toStatus });
    setStatusError(null);
    setStatusNote("");
  }

  async function handleStatusConfirm() {
    if (!statusChange) {
      return;
    }

    const note = statusNote.trim();

    if (!note) {
      setStatusError("Remark is required.");
      return;
    }

    setStatusError(null);
    setIsChangingStatus(true);

    try {
      const response = await fetch(`/api/assets/${statusChange.asset.id}/status`, {
        body: JSON.stringify({
          note,
          status: statusChange.toStatus,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to change asset status.");
      }

      setStatusChange(null);
      setStatusNote("");
      router.refresh();
    } catch (caught) {
      setStatusError(
        caught instanceof Error ? caught.message : "Unable to change asset status.",
      );
    } finally {
      setIsChangingStatus(false);
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-navy">{domainLabel} Inventory</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Click any row to view details.
            </p>
          </div>
          {canRequest ? (
            <p className="text-sm font-semibold text-muted-foreground">
              {requestableCount.toLocaleString("en-US")} requestable
            </p>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                {columns.map((columnKey) => (
                  <SortableHeader
                    activeSort={activeSort}
                    isOpen={openSortKey === columnKey}
                    key={columnKey}
                    onToggle={() =>
                      setOpenSortKey((current) =>
                        current === columnKey ? null : (columnKey as SortKey),
                      )
                    }
                    sortKey={columnKey as SortKey}
                    sortLinks={sortLinks}
                  >
                    {inventoryColumnLabels[columnKey]}
                  </SortableHeader>
                ))}
                {canRequest ? <th className="px-5 py-4 font-bold">Request</th> : null}
                {canDelete ? <th className="px-5 py-4 font-bold">Action</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((asset) => (
                <tr
                  className={[
                    "align-middle transition",
                    "cursor-pointer hover:bg-surface",
                  ].join(" ")}
                  key={asset.id}
                  onClick={() => openAssetDetail(asset)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openAssetDetail(asset);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {columns.map((columnKey) =>
                    columnKey === "status" ? (
                      <td className="px-5 py-4" key={columnKey}>
                        <StatusMenuCell
                          asset={asset}
                          canChangeStatus={canChangeStatus}
                          isOpen={statusMenuAssetId === asset.id}
                          onSelect={openStatusChange}
                          onToggle={() =>
                            setStatusMenuAssetId((currentId) =>
                              currentId === asset.id ? null : asset.id,
                            )
                          }
                        />
                      </td>
                    ) : (
                      <InventoryDataCell
                        asset={asset}
                        columnKey={columnKey}
                        key={columnKey}
                      />
                    ),
                  )}
                  {canRequest ? (
                    <td className="px-5 py-4">
                      <button
                        className="inline-flex h-9 items-center justify-center rounded-md bg-brand-accent px-3 text-xs font-bold text-white transition hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:bg-muted-foreground disabled:text-white/70"
                        disabled={
                          asset.status !== AssetStatus.READY ||
                          asset.availableQuantity <= 0
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          if (
                            asset.status === AssetStatus.READY &&
                            asset.availableQuantity > 0
                          ) {
                            setActiveAsset(asset);
                            setRequestQuantity(1);
                          }
                        }}
                        type="button"
                      >
                        Request
                      </button>
                    </td>
                  ) : null}
                  {canDelete ? (
                    <td className="px-5 py-4">
                      <button
                        className="inline-flex h-9 items-center justify-center rounded-md border border-status-fail/30 bg-white px-3 text-xs font-bold text-status-fail transition hover:bg-status-fail hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteAsset(asset);
                          setDeleteError(null);
                        }}
                        type="button"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
            No assets found.
          </div>
        ) : null}
      </section>

      {activeAsset ? (
        <RequestConfirmDialog
          asset={activeAsset}
          domainLabel={domainLabel}
          error={error}
          isSubmitting={isSubmitting}
          onClose={() => {
            setActiveAsset(null);
            setError(null);
          }}
          onConfirm={handleConfirm}
          onQuantityChange={(quantity) =>
            setRequestQuantity(
              Math.min(Math.max(1, quantity), Math.max(1, activeAsset.availableQuantity)),
            )
          }
          quantity={requestQuantity}
        />
      ) : null}

      {deleteAsset ? (
        <DeleteConfirmDialog
          asset={deleteAsset}
          error={deleteError}
          isSubmitting={isDeleting}
          onClose={() => {
            setDeleteAsset(null);
            setDeleteError(null);
          }}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}

      {statusChange ? (
        <StatusChangeConfirmDialog
          error={statusError}
          isSubmitting={isChangingStatus}
          note={statusNote}
          onClose={() => {
            setStatusChange(null);
            setStatusError(null);
            setStatusNote("");
          }}
          onConfirm={handleStatusConfirm}
          onNoteChange={setStatusNote}
          target={statusChange}
        />
      ) : null}
    </>
  );
}
















