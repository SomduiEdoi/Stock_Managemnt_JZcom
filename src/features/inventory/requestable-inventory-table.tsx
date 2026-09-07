"use client";

import { AssetStatus } from "@prisma/client";
import { CheckCircle2, ChevronDown, Columns3, Loader2, Package, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import { assetStatusHexColors, assetStatusLabels } from "@/lib/status-style";
import { formatWarehouseHeading } from "@/lib/display-labels";

export type RequestableInventoryRow = {
  assetNo?: string | null;
  assetModel: {
    assetType?: { trackMethod: "SERIAL" | "QUANTITY" } | null;
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

type InventoryFamily = "SERIAL" | "QUANTITY";

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

function normalizeTableColumns(columns: TableColumnKey[]): TableColumnKey[] {
  const unique = [...new Set(columns)];
  return [
    "status",
    ...unique.filter((column) => column !== "status" && column !== "action"),
    "action",
  ];
}

const inventoryColumnLabels = {
  assetNo: "Asset No.",
  availability: "Available",
  brand: "Brand",
  category: "Category",
  createdAt: "Created",
  description: "Description",
  image: "Image Ref",
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
};

type RequestableInventoryTableProps = {
  activeSort?: { by: SortKey; direction: SortDirection };
  canRequest: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  warehouseLabel: string;
  categoryName?: string;
  inventoryFamily?: InventoryFamily;
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
  inventoryFamily,
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
  inventoryFamily: InventoryFamily;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (quantity: number, transactionId: string | null) => void;
  onQuantityChange: (quantity: number) => void;
  pendingRequests: PendingRequestOption[];
  quantity: number;
}) {
  const [mode, setMode] = useState<"NEW" | "EXISTING">("NEW");
  const [transactionId, setTransactionId] = useState("");
  const isReady = asset.status === AssetStatus.READY && asset.availableQuantity > 0;
  const isQuantityAsset =
    inventoryFamily === "QUANTITY" ||
    asset.assetModel.assetType?.trackMethod === "QUANTITY";
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
          {warehouseLabel} / {asset.assetModel.name}
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

        {pendingRequests.length > 0 ? (
          <div className="mt-5 rounded-md border border-border p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Request Destination
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                className={`h-10 rounded-md border px-3 text-sm font-bold transition ${
                  mode === "NEW"
                    ? "border-navy bg-navy text-white"
                    : "border-border bg-white text-navy hover:bg-surface"
                }`}
                onClick={() => {
                  setMode("NEW");
                  setTransactionId("");
                }}
                type="button"
              >
                Create new request
              </button>
              <button
                className={`h-10 rounded-md border px-3 text-sm font-bold transition ${
                  mode === "EXISTING"
                    ? "border-navy bg-navy text-white"
                    : "border-border bg-white text-navy hover:bg-surface"
                }`}
                onClick={() => {
                  setMode("EXISTING");
                  setTransactionId(pendingRequests[0]?.id ?? "");
                }}
                type="button"
              >
                Add to existing
              </button>
            </div>
            {mode === "EXISTING" ? (
              <select
                className="mt-3 h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy outline-none ring-brand-accent/20 focus:ring-4"
                onChange={(event) => setTransactionId(event.target.value)}
                value={transactionId}
              >
                {pendingRequests.map((request) => (
                  <option key={request.id} value={request.id}>
                    {request.transactionNo} - {request.purpose} ({request.itemCount} items)
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}

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
            onClick={() => onConfirm(quantity, mode === "EXISTING" ? transactionId : null)}
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
  const displayStatus = getDisplayStatus(asset);

  if (!canChangeStatus || options.length === 0) {
    return <AssetStatusBadge status={displayStatus} />;
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
        <AssetStatusBadge status={displayStatus} />
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
  canDelete,
  canChangeStatus,
  warehouseLabel,
  inventoryFamily = "SERIAL",
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
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [selectedColumns, setSelectedColumns] = useState<TableColumnKey[]>([]);
  const [resizing, setResizing] = useState<{ key: TableColumnKey; startX: number; startWidth: number } | null>(null);

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

  const defaultColumns: TableColumnKey[] = ["status", "category", "type", "brand", "model", "action"];
  const customColumns = customFieldDefinitions.map((field) => `custom:${field.key}` as CustomInventoryColumnKey);
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
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as { columns?: TableColumnKey[]; widths?: Record<string, number> } | null;
      setSelectedColumns(normalizeTableColumns((saved?.columns?.filter((key) => availableColumns.includes(key)) as TableColumnKey[] | undefined) ?? defaultColumns));
      setColumnWidths(saved?.widths ?? {});
    } catch {
      setSelectedColumns(normalizeTableColumns(defaultColumns));
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

  const columns = normalizeTableColumns(selectedColumns.length > 0 ? selectedColumns : defaultColumns);

  function autoFitColumn(columnKey: TableColumnKey) {
    const label = columnKey.startsWith("custom:") ? customFieldDefinitions.find((field) => `custom:${field.key}` === columnKey)?.label ?? columnKey.slice(7) : columnKey === "action" ? "Action" : inventoryColumnLabels[columnKey as InventoryColumnKey];
    const longest = Math.max(label.length, ...rows.map((asset) => String(getTableColumnValue(asset, columnKey) ?? "-").length));
    setColumnWidths((current) => ({ ...current, [columnKey]: Math.min(480, Math.max(120, longest * 8 + 48)) }));
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

      router.refresh();
      router.push(transactionId ? `/logs/${transactionId}/return` : "/request");
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
            <h2 className="text-xl font-bold text-navy">{formatWarehouseHeading(warehouseLabel)}</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Click any row to view details.
            </p>
          </div>
          <div className="relative flex items-center gap-3">
            {canRequest ? <p className="text-sm font-semibold text-muted-foreground">{requestableCount.toLocaleString("en-US")} requestable</p> : null}
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy hover:bg-surface" onClick={() => setColumnMenuOpen((open) => !open)} type="button">
              <Columns3 className="h-4 w-4" /> Columns
            </button>
            {columnMenuOpen ? (
              <div className="absolute right-0 top-12 z-40 w-64 rounded-md border border-border bg-white p-3 shadow-xl" onClick={(event) => event.stopPropagation()}>
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
              </div>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <colgroup>{columns.map((key) => <col key={key} style={{ width: columnWidths[key] ? `${columnWidths[key]}px` : undefined }} />)}</colgroup>
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                {columns.map((columnKey) => (
                  <th className={`relative whitespace-nowrap px-5 py-4 font-bold ${columnKey === "status" ? "sticky left-0 z-20 bg-surface" : columnKey === "action" ? "sticky right-0 z-20 bg-surface" : ""}`} key={columnKey}>
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
                      <td className="sticky left-0 z-10 bg-white px-5 py-4" key={columnKey}>
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
                          {canRequest ? <button className="inline-flex h-9 items-center justify-center rounded-md bg-brand-accent px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-muted-foreground" disabled={asset.status !== AssetStatus.READY || asset.availableQuantity <= 0} onClick={(event) => { event.stopPropagation(); setActiveAsset(asset); setRequestQuantity(1); }} type="button">Request</button> : null}
                          {canDelete ? <button className="inline-flex h-9 items-center justify-center rounded-md border border-status-fail/30 bg-white px-3 text-xs font-bold text-status-fail hover:bg-status-fail hover:text-white" onClick={(event) => { event.stopPropagation(); setDeleteAsset(asset); setDeleteError(null); }} type="button"><Trash2 className="mr-2 h-4 w-4" />Delete</button> : null}
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

        {rows.length === 0 ? (
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
          inventoryFamily={inventoryFamily}
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
















