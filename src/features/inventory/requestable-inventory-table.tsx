"use client";
import { confirmDestructiveAction } from "@/components/form/confirm-destructive-action";

import { AssetStatus } from "@prisma/client";
import { CheckCircle2, ChevronDown, Columns3, Loader2, Package, Pin, Star, Trash2, X } from "lucide-react";
import { useDismiss } from "@/hooks/use-dismiss";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import { AssetImagePreview } from "@/components/assets/asset-image-preview";
import { useDropdownPosition } from "@/components/form/use-dropdown-position";
import { assetStatusHexColors, assetStatusLabels } from "@/lib/status-style";
import { formatWarehouseHeading } from "@/lib/display-labels";
import { getEffectiveAssetTrackMethod } from "@/lib/asset-tracking";
import { readInventoryPreferences } from "./inventory-preferences";

export type RequestableInventoryRow = {
  assetNo?: string | null;
  assetModel: {
    isSerialized: boolean;
    brand: string | null;
    category: { name: string } | null;
    description?: string | null;
    modelNo?: string | null;
    name: string;
    partNo?: string | null;
    typeName: string | null;
  };
  availableQuantity: number;
  id: string;
  isRecommended: boolean;
  locationText: string | null;
  reservedQuantity: number;
  serialNo: string | null;
  status: AssetStatus;
  stockCode: string | null;
  totalQuantity: number;
  customFieldValues?: Array<{ field: { key: string; label: string; unit: string | null }; valueText: string | null }>;
  createdAt?: Date | string;
  location?: { name: string } | null;
  note?: string | null;
  requestLockedById?: string | null;
  imageRef?: string | null;
  sourceRecordId?: string | null;
  sourceSystem?: string | null;
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


type InventoryColumnKey =
  | "assetNo"
  | "availability"
  | "brand"
  | "category"
  | "createdAt"
  | "description"
  | "image"
  | "location"
  | "model"
  | "modelNo"
  | "partNo"
  | "remark"
  | "requestLock"
  | "sourceRecord"
  | "sourceSystem"
  | "serialNo"
  | "status"
  | "stockCode"
  | "type";

type CustomInventoryColumnKey = `custom:${string}`;
type TableColumnKey = InventoryColumnKey | CustomInventoryColumnKey | "action";

export function normalizeTableColumns(columns: TableColumnKey[]): TableColumnKey[] {
  const unique = [...new Set(columns)];
  return [
    ...(unique.includes("image") ? ["image" as const] : []),
    "status",
    ...unique.filter((column) => column !== "status" && column !== "action" && column !== "image"),
    "action",
  ];
}

const inventoryColumnLabels = {
  assetNo: "Asset No.",
  availability: "Total Qty",
  brand: "Brand",
  category: "Category",
  createdAt: "Created",
  description: "Description",
  image: "Image",
  location: "Location",
  model: "Model",
  modelNo: "Model No.",
  partNo: "Part No.",
  remark: "Remark",
  requestLock: "Request Lock",
  sourceRecord: "Source Record ID",
  sourceSystem: "Source System",
  serialNo: "Serial No.",
  status: "Status",
  stockCode: "Stock Code",
  type: "Type",
} as const satisfies Record<InventoryColumnKey, string>;

type PendingRequestOption = {
  createdAt: string;
  id: string;
  itemCount: number;
  purpose: string;
  transactionNo: string;
  type: string;
  workflowStatus: "PENDING" | "REJECTED";
};

type RequestableInventoryTableProps = {
  activeSort?: { by: SortKey; direction: SortDirection };
  canRequest: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  canRecommend: boolean;
  warehouseCode: string;
  favoriteOnly?: boolean;
  warehouseLabel: string;
  categoryName?: string;
  rows: RequestableInventoryRow[];
  sortLinks?: Partial<Record<SortKey, { asc: string; desc: string }>>;
  customFieldDefinitions?: Array<{ key: string; label: string; unit: string | null }>;
};

type StatusChangeTarget = {
  asset: RequestableInventoryRow;
  toStatus: AssetStatus;
};

function displayValue(value: string | null | undefined) {
  return value || "-";
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
        <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-extrabold text-navy">
          {asset.availableQuantity.toLocaleString("en-US")}
        </p>
        {asset.reservedQuantity > 0 ? (
          <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-status-request">
            ({asset.reservedQuantity.toLocaleString("en-US")} reserved)
          </p>
        ) : null}
      </div>
    </td>
  );
}

function getInventoryColumnValue(
  asset: RequestableInventoryRow,
  columnKey: InventoryColumnKey,
) {
  switch (columnKey) {
    case "assetNo":
      return asset.assetNo;
    case "brand":
      return asset.assetModel.brand;
    case "category":
      return asset.assetModel.category?.name;
    case "createdAt":
      return asset.createdAt ? new Date(asset.createdAt).toLocaleDateString("en-GB") : null;
    case "description":
      return asset.assetModel.description;
    case "image":
      return asset.imageRef;
    case "location":
      return asset.location?.name ?? asset.locationText;
    case "model":
      return asset.assetModel.name;
    case "modelNo":
      return asset.assetModel.modelNo;
    case "partNo":
      return asset.assetModel.partNo;
    case "remark":
      return asset.note;
    case "requestLock":
      return asset.requestLockedById ? "Locked" : "No active lock";
    case "sourceRecord":
      return asset.sourceRecordId;
    case "sourceSystem":
      return asset.sourceSystem;
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

function getTableColumnValue(asset: RequestableInventoryRow, columnKey: TableColumnKey) {
  if (columnKey.startsWith("custom:")) {
    return asset.customFieldValues?.find((value) => value.field.key === columnKey.slice(7))?.valueText ?? null;
  }
  return columnKey === "action" || columnKey === "status" || columnKey === "availability"
    ? null
    : getInventoryColumnValue(asset, columnKey as InventoryColumnKey);
}

function getExportColumnLabel(columnKey: TableColumnKey, customFieldDefinitions: RequestableInventoryTableProps["customFieldDefinitions"]) {
  if (columnKey.startsWith("custom:")) {
    return customFieldDefinitions?.find((field) => `custom:${field.key}` === columnKey)?.label ?? columnKey.slice(7);
  }

  return columnKey === "action" ? "Action" : inventoryColumnLabels[columnKey as InventoryColumnKey];
}

function getExportValue(asset: RequestableInventoryRow, columnKey: TableColumnKey) {
  if (columnKey === "status") {
    return assetStatusLabels[getDisplayStatus(asset)];
  }

  if (columnKey === "availability") {
    return asset.availableQuantity;
  }

  return displayValue(getTableColumnValue(asset, columnKey));
}

function ExcelExportIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 32 32" fill="none">
      <path d="M18 6h9a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-9V6Z" fill="currentColor" />
      <path d="M7 5.5 20 3.5v25L7 26.5a2 2 0 0 1-1.7-2V7.5a2 2 0 0 1 1.7-2Z" fill="white" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m9 10 7 12m0-12-7 12" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}

function InventoryDataCell({
  asset,
  columnKey,
}: {
  asset: RequestableInventoryRow;
  columnKey: TableColumnKey;
}) {
  if (columnKey === "availability") {
    return <AvailabilityCell asset={asset} />;
  }
  if (columnKey === "image") {
    return <td className="px-5 py-3"><AssetImagePreview src={asset.imageRef} alt={asset.assetModel.name} /></td>;
  }

  if (columnKey === "status" || columnKey === "action") {
    return null;
  }

  const value = getTableColumnValue(asset, columnKey);

  return (
    <TruncatedCell
      className={columnKey === "model" || columnKey === "serialNo" ? "font-bold text-navy" : "text-ink"}
      title={value}
    >
      {displayValue(value)}
    </TruncatedCell>
  );
}

function getDisplayStatus(asset: RequestableInventoryRow) {
  return asset.status === AssetStatus.READY &&
    asset.reservedQuantity > 0 &&
    asset.availableQuantity <= 0
    ? AssetStatus.REQUEST
    : asset.status;
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
  warehouseLabel,
  error,
  isSubmitting,
  onClose,
  onConfirm,
  onQuantityChange,
  pendingRequests,
  quantity,
}: {
  asset: RequestableInventoryRow;
  warehouseLabel: string;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (quantity: number, transactionId: string | null) => void;
  onQuantityChange: (quantity: number) => void;
  pendingRequests: PendingRequestOption[];
  quantity: number;
}) {
  const [transactionId, setTransactionId] = useState("");
  const isReady = asset.status === AssetStatus.READY && asset.availableQuantity > 0;
  const isQuantityAsset = getEffectiveAssetTrackMethod(asset) === "QUANTITY";
  const maxQuantity = Math.max(1, asset.availableQuantity);

  useEffect(() => {
    if (pendingRequests.length === 0) {
      setTransactionId("");
      return;
    }

    setTransactionId((current) =>
      pendingRequests.some((request) => request.id === current)
        ? current
        : pendingRequests[0].id,
    );
  }, [pendingRequests]);

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

        <h2 className="mt-5 text-2xl font-bold text-navy">Request this item?</h2>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {warehouseLabel} / {asset.assetModel.name}
        </p>

        <div className="mt-6 grid gap-3 rounded-md border border-border bg-surface px-4 py-4 text-sm font-semibold text-ink sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Category / Type</p>
            <p className="mt-1">{[asset.assetModel.category?.name, asset.assetModel.typeName].filter(Boolean).join(" / ") || "-"}</p>
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

        <div className="mt-5 rounded-md border border-border p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Request Destination
          </p>
          {pendingRequests.length > 0 ? (
            <select
              aria-label="Existing request"
              className="mt-3 h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy outline-none ring-brand-accent/20 focus:ring-4"
              onChange={(event) => setTransactionId(event.target.value)}
              value={transactionId}
            >
              {pendingRequests.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.transactionNo} - {request.purpose} ({request.itemCount} items, {request.workflowStatus === "REJECTED" ? "Rejected" : "Pending"})
                </option>
              ))}
            </select>
          ) : null}
          <div className={`mt-3 grid gap-2 ${pendingRequests.length > 0 ? "sm:grid-cols-2" : ""}`}>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-navy bg-navy px-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isReady || isSubmitting}
              onClick={() => onConfirm(quantity, null)}
              type="button"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create new request
            </button>
            {pendingRequests.length > 0 ? (
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isReady || isSubmitting || !transactionId}
                onClick={() => onConfirm(quantity, transactionId)}
                type="button"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add to existing
              </button>
            ) : null}
          </div>
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
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useDropdownPosition(isOpen, triggerRef, menuRef, 176);
  useDismiss(isOpen, onToggle, [triggerRef, menuRef]);
  const displayStatus = getDisplayStatus(asset);

  if (!canChangeStatus || options.length === 0) {
    return <AssetStatusBadge status={displayStatus} />;
  }

  return (
    <div ref={triggerRef} className="relative inline-block overflow-visible">
      <button
        className="inline-flex items-center gap-2 rounded-full focus:outline-none focus:ring-4 focus:ring-brand-accent/20"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Change status for ${asset.id}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        type="button"
      >
        <AssetStatusBadge status={displayStatus} />
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Asset status"
          className="fixed z-[100] overflow-y-auto rounded-md border border-border bg-white p-2 shadow-xl"
          style={{ ...position, visibility: position.width ? "visible" : "hidden" }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") onToggle();
          }}
        >
          {options.map((status) => (
            <button
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-bold text-navy transition hover:bg-surface"
              role="menuitem"
              key={status}
              onClick={() => onSelect(asset, status)}
              type="button"
            >
              <span>{assetStatusLabels[status]}</span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: assetStatusHexColors[status] }}
              />
            </button>
          ))}
        </div>
      , document.body) : null}
    </div>
  );
}

export function RequestableInventoryTable({
  canDelete,
  canChangeStatus,
  canRecommend,
  warehouseCode,
  favoriteOnly = false,
  warehouseLabel,
  canRequest,
  rows,
  sortLinks,
  customFieldDefinitions = [],
  categoryName,
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
  const [pendingRequests, setPendingRequests] = useState<PendingRequestOption[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnTriggerRef = useRef<HTMLButtonElement>(null);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLTableCellElement>(null);
  useDismiss(columnMenuOpen, () => setColumnMenuOpen(false), [columnTriggerRef, columnMenuRef]);
  useDismiss(openSortKey !== null, () => setOpenSortKey(null), [sortMenuRef]);
  const [columnMenuPosition, setColumnMenuPosition] = useState({ left: 0, top: 0 });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [selectedColumns, setSelectedColumns] = useState<TableColumnKey[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const favoritesOnly = favoriteOnly;
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [recommendationBusy, setRecommendationBusy] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ key: TableColumnKey; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    fetch(`/api/favorites?warehouse=${encodeURIComponent(warehouseCode)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load favorites")))
      .then((data: { assetIds?: string[] }) => setFavoriteIds(new Set(data.assetIds ?? [])))
      .catch(() => setFavoriteIds(new Set()));
  }, [warehouseCode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("pendingTransactionId");
    const search = params.toString();

    window.localStorage.setItem(
      "stock:lastInventoryHref",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }, []);

  useEffect(() => {
    if (!activeAsset || !canRequest) {
      return;
    }

    let ignore = false;
    fetch("/api/transactions/pending")
      .then((response) => (response.ok ? response.json() : { transactions: [] }))
      .then((data: { transactions?: PendingRequestOption[] }) => {
        if (!ignore) {
          setPendingRequests(data.transactions ?? []);
        }
      })
      .catch(() => {
        if (!ignore) {
          setPendingRequests([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeAsset, canRequest]);

  const defaultColumns: TableColumnKey[] = ["image", "status", "category", "type", "brand", "model", "action"];
  const customColumns = customFieldDefinitions.map((field): CustomInventoryColumnKey => `custom:${field.key}`);
  const productColumns: InventoryColumnKey[] = ["category", "type", "brand", "model", "serialNo", "stockCode", "location", "partNo", "description", "remark", "availability"];
  const selectableColumns: TableColumnKey[] = Array.from(
    new Set<TableColumnKey>([
      ...defaultColumns.filter((key) => key !== "status" && key !== "action"),
      ...productColumns,
      ...customColumns,
    ]),
  );
  const availableColumns: TableColumnKey[] = [...selectableColumns, "status", "action"];

  // Column definitions are derived from the current warehouse schema; load saved preferences only when the warehouse changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const storageKey = `stock:inventory-columns:${warehouseLabel}:${categoryName ?? "ALL"}`;
    try {
      const saved = readInventoryPreferences(window.localStorage.getItem(storageKey));
      const columns = saved?.columns?.filter((key): key is TableColumnKey => availableColumns.some((column) => column === key));
      setSelectedColumns(normalizeTableColumns(columns ?? defaultColumns));
      setColumnWidths(saved?.widths ?? {});
    } catch {
      setSelectedColumns(normalizeTableColumns(defaultColumns));
      setColumnWidths({});
    }
  // These arrays are render-local projections of the current schema and intentionally reload only per warehouse.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseLabel, categoryName]);

  useEffect(() => {
    if (selectedColumns.length === 0) return;
    window.localStorage.setItem(`stock:inventory-columns:${warehouseLabel}:${categoryName ?? "ALL"}`, JSON.stringify({ columns: selectedColumns, widths: columnWidths }));
  }, [columnWidths, warehouseLabel, categoryName, selectedColumns]);

  useEffect(() => {
    if (!resizing) return;
    const move = (event: MouseEvent) => setColumnWidths((current) => ({ ...current, [resizing.key]: Math.max(90, resizing.startWidth + event.clientX - resizing.startX) }));
    const stop = () => setResizing(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); };
  }, [resizing]);

  useLayoutEffect(() => {
    if (!columnMenuOpen || !columnTriggerRef.current) return;

    const updateColumnMenuPosition = () => {
      const trigger = columnTriggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = columnMenuRef.current?.offsetWidth ?? 256;
      const menuHeight = columnMenuRef.current?.offsetHeight ?? 360;
      const gap = 8;
      const viewportPadding = 8;
      const opensBelow = triggerRect.bottom + gap + menuHeight <= window.innerHeight - viewportPadding;
      const top = opensBelow
        ? triggerRect.bottom + gap
        : Math.max(viewportPadding, triggerRect.top - menuHeight - gap);
      const left = Math.min(
        Math.max(viewportPadding, triggerRect.right - menuWidth),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );

      setColumnMenuPosition({ left, top });
    };

    updateColumnMenuPosition();
    window.addEventListener("resize", updateColumnMenuPosition);
    window.addEventListener("scroll", updateColumnMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateColumnMenuPosition);
      window.removeEventListener("scroll", updateColumnMenuPosition, true);
    };
  }, [columnMenuOpen, selectableColumns.length]);

  const columns = normalizeTableColumns(selectedColumns.length > 0 ? selectedColumns : defaultColumns);
  const visibleRows = rows;

  async function toggleFavorite(assetId: string) {
    setFavoriteBusy(assetId);
    try {
      const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) });
      if (!response.ok) return;
      const data = (await response.json()) as { favorite: boolean };
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (data.favorite) next.add(assetId); else next.delete(assetId);
        return next;
      });
    } finally {
      setFavoriteBusy(null);
    }
  }

  async function toggleRecommendation(asset: RequestableInventoryRow) {
    setRecommendationBusy(asset.id);
    try {
      const response = await fetch(`/api/assets/${asset.id}/recommendation`, {
        body: JSON.stringify({ recommended: !asset.isRecommended }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.ok) {
        router.refresh();
      }
    } finally {
      setRecommendationBusy(null);
    }
  }

  function autoFitColumn(columnKey: TableColumnKey) {
    const label = columnKey.startsWith("custom:") ? customFieldDefinitions.find((field) => `custom:${field.key}` === columnKey)?.label ?? columnKey.slice(7) : columnKey === "action" ? "Action" : inventoryColumnLabels[columnKey as InventoryColumnKey];
    const longest = Math.max(label.length, ...rows.map((asset) => String(getTableColumnValue(asset, columnKey) ?? "-").length));
    setColumnWidths((current) => ({ ...current, [columnKey]: Math.min(480, Math.max(120, longest * 8 + 48)) }));
  }

  async function exportToExcel() {
    setIsExporting(true);
    const params = new URLSearchParams(window.location.search);
    params.set("warehouse", warehouseCode);
    const response = await fetch(`/api/inventory/export?${params.toString()}`);

    if (!response.ok) {
      setIsExporting(false);
      return;
    }

    const body = await response.json() as { rows?: RequestableInventoryRow[] };
    const exportRows = body.rows ?? [];
    // Export is independent from the user's display-column preferences. Keep the
    // active row filters/search from the request above, but include every known
    // inventory field and the category-specific specification fields.
    const exportColumns = normalizeTableColumns([
      "status",
      ...(Object.keys(inventoryColumnLabels) as InventoryColumnKey[]),
      ...customColumns,
    ]).filter((columnKey) => !["action", "sourceRecord", "sourceSystem"].includes(columnKey));
    const data = exportRows.map((asset) => Object.fromEntries(
      exportColumns.map((columnKey) => [
        getExportColumnLabel(columnKey, customFieldDefinitions),
        getExportValue(asset, columnKey),
      ]),
    ));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const safeWarehouseName = warehouseLabel.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Warehouse";
    XLSX.writeFile(workbook, `${safeWarehouseName}_Inventory_${date}.xlsx`);
    setIsExporting(false);
  }

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

  async function handleConfirm(quantity: number, transactionId: string | null) {
    if (!activeAsset) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        items: [
          {
            assetId: activeAsset.id,
            quantity,
          },
        ],
        note: `Requested from ${warehouseLabel} inventory.`,
      };
      const response = await fetch(
        transactionId
          ? `/api/transactions/${transactionId}/items`
          : "/api/requests/hold",
        {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to request asset.");
      }

      setActiveAsset(null);
      setRequestQuantity(1);
      router.refresh();
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
      const proof = await confirmDestructiveAction(`/assets/${deleteAsset.id}`, `Asset: ${deleteAsset.assetModel.name} (${deleteAsset.stockCode ?? deleteAsset.serialNo ?? deleteAsset.id})`);
      if (!proof) { setIsDeleting(false); return; }
      const response = await fetch(`/api/assets/${deleteAsset.id}`, {
        method: "DELETE",
        headers: { "x-delete-proof": proof },
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
            <h2 className="text-xl font-bold text-navy">{formatWarehouseHeading(warehouseLabel)}</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Click any row to view details.
            </p>
          </div>
          <div className="relative flex items-center gap-3">
            {canRequest ? <p className="text-sm font-semibold text-muted-foreground">{requestableCount.toLocaleString("en-US")} requestable</p> : null}
            <button className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold ${favoritesOnly ? "border-brand-accent bg-brand-accent text-white" : "border-navy/30 bg-white text-navy hover:bg-navy/10"}`} onClick={() => { const params = new URLSearchParams(window.location.search); if (favoritesOnly) { params.delete("favorite"); } else { params.set("favorite", "1"); params.delete("category"); params.delete("brand"); params.delete("type"); params.delete("status"); params.delete("q"); } params.delete("page"); router.push(`${window.location.pathname}?${params.toString()}`); }} type="button">
              <Star className={`h-4 w-4 ${favoritesOnly ? "fill-current" : ""}`} /> Favorite
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-navy/30 bg-white px-3 text-sm font-bold text-navy hover:bg-navy/10 disabled:cursor-wait disabled:opacity-60" disabled={isExporting} onClick={exportToExcel} type="button" title="Export filtered inventory rows to Excel">
              <ExcelExportIcon /> Export
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy hover:bg-surface" onClick={() => setColumnMenuOpen((open) => !open)} ref={columnTriggerRef} type="button">
              <Columns3 className="h-4 w-4" /> Columns
            </button>
            {columnMenuOpen && typeof document !== "undefined" ? createPortal(
              <div
                className="fixed z-[100] max-h-[calc(100vh-1rem)] w-64 rounded-md border border-border bg-white p-3 shadow-xl"
                onClick={(event) => event.stopPropagation()}
                ref={columnMenuRef}
                style={{ left: columnMenuPosition.left, top: columnMenuPosition.top }}
              >
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Visible columns ({columns.length}/10)</p>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {selectableColumns.map((key) => {
                    const required = false;
                    const checked = columns.includes(key);
                    const disabled = !required && !checked && columns.length >= 10;
                    const label = key.startsWith("custom:") ? customFieldDefinitions.find((field) => `custom:${field.key}` === key)?.label ?? key.slice(7) : key === "action" ? "Action" : inventoryColumnLabels[key as InventoryColumnKey];
                    return <label className={`flex items-center gap-2 rounded px-2 py-2 text-sm ${disabled ? "cursor-not-allowed text-muted-foreground/50" : "text-navy hover:bg-surface"}`} key={key} title={disabled ? "Maximum 10 columns can be displayed." : undefined}>
                      <input checked={checked} disabled={required || disabled} onChange={() => setSelectedColumns((current) => normalizeTableColumns(checked ? current.filter((item) => item !== key) : [...current, key]))} type="checkbox" />
                      <span className="truncate">{label}</span>
                    </label>;
                  })}
                </div>
              </div>,
              document.body,
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <colgroup>{columns.map((key) => <col key={key} style={{ width: columnWidths[key] ? `${columnWidths[key]}px` : key === "image" ? "88px" : undefined }} />)}</colgroup>
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                {columns.map((columnKey) => (
                  <th ref={openSortKey === columnKey ? sortMenuRef : undefined} className={`relative whitespace-nowrap px-5 py-4 font-bold ${columnKey === "status" ? "sticky left-0 z-20 bg-surface" : columnKey === "action" ? "sticky right-0 z-20 bg-surface" : ""}`} key={columnKey}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{columnKey.startsWith("custom:") ? customFieldDefinitions.find((field) => `custom:${field.key}` === columnKey)?.label ?? columnKey.slice(7) : columnKey === "action" ? "Action" : inventoryColumnLabels[columnKey as InventoryColumnKey]}</span>
                      {columnKey !== "action" && columnKey !== "status" && sortLinks?.[columnKey as SortKey] ? <button className="shrink-0" onClick={(event) => { event.stopPropagation(); setOpenSortKey((current) => current === columnKey ? null : columnKey as SortKey); }} type="button"><ChevronDown className="h-3.5 w-3.5" /></button> : null}
                      {openSortKey === columnKey && sortLinks?.[columnKey as SortKey] ? <div className="absolute left-4 top-[calc(100%-0.35rem)] z-40 w-44 rounded-md border border-border bg-white py-2 text-sm normal-case text-ink shadow-xl"><Link className="block px-3 py-2 hover:bg-surface" href={sortLinks[columnKey as SortKey]!.asc}>A to Z</Link><Link className="block px-3 py-2 hover:bg-surface" href={sortLinks[columnKey as SortKey]!.desc}>Z to A</Link></div> : null}
                      <span className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-brand-accent" onDoubleClick={() => autoFitColumn(columnKey)} onMouseDown={(event) => { event.preventDefault(); setResizing({ key: columnKey, startX: event.clientX, startWidth: columnWidths[columnKey] ?? 180 }); }} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.map((asset) => (
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
                      <td className="sticky left-0 z-10 overflow-visible bg-white px-5 py-4" key={columnKey}>
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
                    ) : columnKey === "action" ? (
                      <td className="sticky right-0 z-10 bg-white px-5 py-4" key={columnKey}>
                        <div className="flex items-center gap-2">
                          <button aria-label={favoriteIds.has(asset.id) ? "Remove from favorites" : "Add to favorites"} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 hover:bg-amber-50 hover:text-yellow-400 disabled:opacity-50" disabled={favoriteBusy === asset.id} onClick={(event) => { event.stopPropagation(); void toggleFavorite(asset.id); }} title={favoriteIds.has(asset.id) ? "Remove from favorites" : "Favorite"} type="button">
                            <Star className={`h-5 w-5 ${favoriteIds.has(asset.id) ? "fill-yellow-400 text-yellow-400" : ""}`} />
                          </button>
                          {canRecommend ? (
                            <button
                              aria-label={asset.isRecommended ? "Remove recommendation" : "Recommend asset"}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-md disabled:cursor-wait disabled:opacity-50 ${asset.isRecommended ? "text-brand-accent" : "text-gray-400 hover:text-brand-accent"}`}
                              disabled={recommendationBusy === asset.id}
                              onClick={(event) => { event.stopPropagation(); void toggleRecommendation(asset); }}
                              type="button"
                              title={asset.isRecommended ? "Remove recommendation" : "Recommend asset"}
                            >
                              <Pin className={`h-5 w-5 ${asset.isRecommended ? "fill-current" : ""}`} />
                            </button>
                          ) : null}
                          {canRequest ? <button className="inline-flex h-9 items-center justify-center rounded-md bg-brand-accent px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-muted-foreground" disabled={asset.status !== AssetStatus.READY || asset.availableQuantity <= 0} onClick={(event) => { event.stopPropagation(); setActiveAsset(asset); setRequestQuantity(1); }} type="button">Request</button> : null}
                          {canDelete ? <button aria-label="Delete asset" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-status-fail hover:bg-red-50 disabled:opacity-50" onClick={(event) => { event.stopPropagation(); setDeleteAsset(asset); setDeleteError(null); }} title="Delete" type="button"><Trash2 className="h-5 w-5" /></button> : null}
                        </div>
                      </td>
                    ) : (
                      <InventoryDataCell
                        asset={asset}
                        columnKey={columnKey}
                        key={columnKey}
                      />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visibleRows.length === 0 ? (
          <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
            No assets found.
          </div>
        ) : null}
      </section>

      {activeAsset ? (
        <RequestConfirmDialog
          asset={activeAsset}
          warehouseLabel={warehouseLabel}
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
          pendingRequests={pendingRequests}
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
















