"use client";

import { formatProjectLabel } from "@/lib/project-label";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, FileDown, Loader2, Trash2, XCircle } from "lucide-react";
import { AssetStatus, type TransactionType, type TransactionWorkflowStatus } from "@prisma/client";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import { downloadTransactionPdf } from "@/features/transactions/transaction-pdf-download";
import { availableReturnQuantity } from "./return-quantity";
import { calculateSaleGrandTotal, calculateSaleGroupTotal, clampSaleGroupQuantity, normalizeSaleMoney, validateSalePriceGroups, type SalePriceGroup } from "@/lib/sale-price-groups";

export type TransactionReturnItem = {
  assetId: string;
  brand: string | null;
  category: string | null;
  partNo: string | null;
  hasPendingOutcome: boolean;
  pendingBatchIds: (string | null)[];
  isDispatched: boolean;
  canConfirmSerial?: boolean;
  currentStep: string;
  currentStatus: AssetStatus;
  isQuantityAsset: boolean;
  itemId: string;
  kindLabel: string;
  model: string;
  note: string | null;
  requestedQuantity: number;
  availableQuantity: number;
  resolvedAt: string | null;
  resolvedQuantity: number;
  resolvedStatus: AssetStatus | null;
  resolutionNote: string | null;
  soldPrice: string | null;
  serialNo: string | null;
  soldTotal?: string | null;
  salePriceGroups?: SalePriceGroup[];
  stockCode: string | null;
  typeName: string | null;
  warehouseName: string;
};

export type TransactionOutcomeSummary = {
  id: string;
  itemId: string;
  model: string;
  resolutionBatchId: string | null;
  partNo: string | null;
  stockCode: string | null;
  typeName: string | null;
  warehouseName: string;
  serialNo: string | null;
  outcomeStatus: AssetStatus;
  quantity: number;
  returnCondition: "NEW" | "USED" | null;
  returnStockAssetId: string | null;
  returnStockOptions: Array<{
    id: string;
    stockCode: string;
  }>;
  note: string | null;
  soldPrice: string | null;
  approvedAt: string | null;
  soldTotal?: string | null;
  canChooseCondition: boolean;
  canDelete: boolean;
};

type EditableRequestItem = {
  assetId: string;
  isQuantityAsset: boolean;
  model: string;
  quantity: number;
  availableQuantity: number;
  serialNo: string | null;
  stockCode: string | null;
};

export type TransactionReturnRecord = {
  approvalStep: number | null;
  approvalTag: string | null;
  canApprove: boolean;
  approvalBlockedReason: string | null;
  canExportAnytime: boolean;
  isAcknowledgement: boolean;
  canEditPendingRequest: boolean;
  canReturn: boolean;
  editableReturnBatches: { id: string; requestNo: string; phase: string }[];
  hasSignature: boolean;
  returnBlockedReason: string | null;
  id: string;
  internalRequest: boolean;
  sourceTransactionId: string | null;
  items: TransactionReturnItem[];
  outcomes: TransactionOutcomeSummary[];
  kindLabel: string;
  requestDate: string;
  requisitionerName: string;
  requisitionerPosition: string | null;
  customerName: string | null;
  projectName: string | null;
  projectCode: string | null;
  returnDate: string | null;
  originWarehouse: string;
  leadSupervisorName: string;
  currentApprovalStep: string;
  statusLabel: string;
  note: string | null;
  projectId: string | null;
  projectRequest: boolean;
  purpose: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  rejectBlockedReason: string | null;
  requestedBy: string;
  requiresSoldPriceApproval: boolean;
  soldPrice?: string | null;
  serviceRequest: boolean;
  transactionNo: string;
  type: TransactionType;
  workflowStatus: TransactionWorkflowStatus;
};

type ResolutionState = Record<
  string,
  {
    selected: boolean;
    toStatus: AssetStatus;
    quantity: number;
    allocations: { quantity: number; toStatus: AssetStatus; returnCondition: "NEW" | "USED" | null; note: string; soldPrice: string }[];
  }
>;

const missingSignatureMessage =
  "Please upload your signature before approving the document.";

export function removeResolutionAllocation(state: ResolutionState[string], index: number) {
  if (state.allocations.length <= 1 || index < 0 || index >= state.allocations.length) return state;
  const allocations = state.allocations.filter((_, position) => position !== index);
  return { ...state, allocations, quantity: allocations[0].quantity, toStatus: allocations[0].toStatus };
}

const resolutionOptions = [
  "READY",
  "SOLD",
  "FAIL",
  "LOST",
] as const satisfies readonly AssetStatus[];

const resolutionOptionLabels = {
  READY: "RETURN",
  SOLD: "Sold",
  FAIL: "Fail",
  LOST: "Lost",
} as const satisfies Record<(typeof resolutionOptions)[number], string>;

export function canOpenReturnApproval(canApprove: boolean, approvalTag: string | null, mode: "APPROVE" | "REJECT") {
  return canApprove && (mode === "REJECT" || !approvalTag?.startsWith("RETURN_CHECK:"));
}

export function hasOpenReturnQuantity(workflowStatus: string, availableQuantity: number) {
  return workflowStatus !== "COMPLETED" && workflowStatus !== "CANCELLED" && availableQuantity > 0;
}

export function getReturnResolutionOptions(isQuantityAsset: boolean) {
  return [
    ...resolutionOptions.map((status) => ({ label: resolutionOptionLabels[status], searchText: `${resolutionOptionLabels[status]} ${status}`, value: status as string })),
    ...(isQuantityAsset ? [{ label: "USED", searchText: "USED", value: "USED" }] : []),
  ];
}

export function classifyReturnOutcome(value: string, isQuantityAsset: boolean): {
  toStatus: AssetStatus;
  returnCondition: "NEW" | "USED" | null;
} {
  if (value === "USED" && isQuantityAsset) return { toStatus: AssetStatus.READY, returnCondition: "USED" };
  if (!resolutionOptions.some((status) => status === value)) throw new Error("Invalid return outcome.");
  return { toStatus: value as AssetStatus, returnCondition: value === "READY" ? "NEW" : null };
}

type ReturnRevisionItem = Pick<TransactionReturnItem, "itemId" | "resolvedAt" | "requestedQuantity"> & { resolvedQuantity?: number };

function buildInitialState(items: ReturnRevisionItem[]): ResolutionState {
  return Object.fromEntries(
    items
      .filter((item) => !item.resolvedAt || (item.resolvedQuantity !== undefined && item.resolvedQuantity < item.requestedQuantity))
      .map((item) => [
        item.itemId,
        {
          selected: false,
          toStatus: "READY" as AssetStatus,
          quantity: item.requestedQuantity,
          allocations: [{ quantity: item.requestedQuantity, toStatus: AssetStatus.READY, returnCondition: "NEW", note: "", soldPrice: "" }],
        },
      ]),
  );
}

export function buildReturnBatchRevision(
  items: ReturnRevisionItem[],
  outcomes: Pick<TransactionOutcomeSummary, "itemId" | "resolutionBatchId" | "approvedAt" | "quantity" | "outcomeStatus" | "returnCondition" | "note" | "soldPrice">[],
  batchId: string,
): ResolutionState {
  const next = buildInitialState(items);
  for (const item of items) {
    const state = next[item.itemId];
    if (!state) continue;
    const quantity = availableReturnQuantity(item, outcomes, batchId);
    state.quantity = quantity;
    state.allocations[0].quantity = quantity;
  }
  if (!batchId) return next;
  for (const item of items) {
    const rows = outcomes.filter((outcome) => outcome.itemId === item.itemId && outcome.resolutionBatchId === batchId && !outcome.approvedAt);
    if (!rows.length || !next[item.itemId]) continue;
    next[item.itemId] = {
      selected: true, quantity: rows[0].quantity, toStatus: rows[0].outcomeStatus,
      allocations: rows.map((outcome) => ({ quantity: outcome.quantity, toStatus: outcome.outcomeStatus, returnCondition: outcome.returnCondition, note: outcome.note ?? "", soldPrice: outcome.soldPrice ?? "" })),
    };
  }
  return next;
}

function fallback(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

export function formatReturnDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    calendar: "gregory", numberingSystem: "latn", timeZone: "Asia/Bangkok",
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

type TransactionProjectOption = {
  customerName?: string;
  id: string;
  name: string;
  projectId: string | null;
};

export function TransactionReturnClient({
  canExportAnytime,
  projects,
  transaction,
}: {
  canExportAnytime: boolean;
  projects: TransactionProjectOption[];
  transaction: TransactionReturnRecord;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmationMode, setConfirmationMode] = useState<
    "RETURN" | "SOLD" | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approvalMode, setApprovalMode] = useState<"APPROVE" | "REJECT" | null>(null);
  const [editProjectId, setEditProjectId] = useState(transaction.projectId ?? "");
  const [editPurpose, setEditPurpose] = useState(transaction.purpose ?? "");
  const [editNote, setEditNote] = useState(transaction.note ?? "");
  const [editType, setEditType] = useState<TransactionType>(transaction.type);
  const [editScope, setEditScope] = useState<"internal" | "service" | "project">(
    transaction.internalRequest ? "internal" : transaction.projectRequest ? "project" : "service",
  );
  const [editItems, setEditItems] = useState<EditableRequestItem[]>(
    () =>
      transaction.items.map((item) => ({
        assetId: item.assetId,
        isQuantityAsset: item.isQuantityAsset,
        model: item.model,
        quantity: item.requestedQuantity,
        availableQuantity: item.availableQuantity,
        serialNo: item.serialNo,
        stockCode: item.stockCode,
      })),
  );
  const [lastInventoryHref, setLastInventoryHref] = useState("/dashboard/server");
  const [resolutions, setResolutions] = useState<ResolutionState>(() =>
    buildReturnBatchRevision(transaction.items, transaction.outcomes, ""),
  );
  const [quantityErrors, setQuantityErrors] = useState<Record<string, string>>({});
  const [editQuantityErrors, setEditQuantityErrors] = useState<Record<string, string>>({});
  const [deletingOutcomeId, setDeletingOutcomeId] = useState<string | null>(null);
  const [resolutionBatchId, setResolutionBatchId] = useState("");
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [confirmingSerialId, setConfirmingSerialId] = useState<string | null>(null);
  const [serialOptions, setSerialOptions] = useState<Record<string, { id: string; serialNo: string; stockCode: string | null }[]>>({});
  const [selectedSerials, setSelectedSerials] = useState<Record<string, string>>({});

  async function loadSerialOptions(item: TransactionReturnItem) {
    if (!item.canConfirmSerial) return;
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/items/${item.itemId}/swap`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to load serial numbers.");
      setSerialOptions((current) => ({ ...current, [item.itemId]: data.assets }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load serial numbers.");
    }
  }

  async function confirmIssueSerial(item: TransactionReturnItem) {
    if (!item.canConfirmSerial || confirmingSerialId) return;
    setConfirmingSerialId(item.itemId);
    setError(null);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/items/${item.itemId}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replacementAssetId: selectedSerials[item.itemId] ?? item.assetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to confirm serial number.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm serial number.");
    } finally {
      setConfirmingSerialId(null);
    }
  }

  async function cancelReturnBatch(batchId: string) {
    const batch = transaction.editableReturnBatches.find((candidate) => candidate.id === batchId);
    if (!batch || cancellingBatchId || isSubmitting) return;
    if (!window.confirm(`Cancel return round ${batch.requestNo}?`)) return;
    setCancellingBatchId(batchId);
    setError(null);
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(transaction.id)}/return-batches/${encodeURIComponent(batchId)}/cancel`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Unable to cancel return round.");
      if (resolutionBatchId === batchId) selectReturnBatch("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel return round.");
    } finally {
      setCancellingBatchId(null);
    }
  }

  function selectReturnBatch(batchId: string) {
    if (batchId && !transaction.editableReturnBatches.some((batch) => batch.id === batchId)) return;
    const next = buildReturnBatchRevision(transaction.items, transaction.outcomes, batchId);
    setResolutionBatchId(batchId);
    setResolutions(next);
    setQuantityErrors({});
    setError(null);
  }

  const openItems = useMemo(
    () => transaction.items.filter((item) => hasOpenReturnQuantity(transaction.workflowStatus, availableReturnQuantity(item, transaction.outcomes, resolutionBatchId))),
    [transaction.workflowStatus, transaction.items, transaction.outcomes, resolutionBatchId],
  );
  const openQuantity = useMemo(
    () => openItems.reduce((sum, item) => sum + availableReturnQuantity(item, transaction.outcomes, resolutionBatchId), 0),
    [openItems, transaction.outcomes, resolutionBatchId],
  );
  const soldSummary = useMemo(() => {
    const rows = openItems.flatMap((item) => {
      const state = resolutions[item.itemId];
      return state?.selected
        ? state.allocations
            .filter((allocation) => allocation.toStatus === "SOLD" && allocation.soldPrice.trim())
            .map((allocation) => ({ quantity: allocation.quantity, price: Number(allocation.soldPrice) || 0 }))
        : [];
    });
    return {
      total: rows.reduce((sum, row) => sum + row.quantity * row.price, 0),
      count: rows.length,
    };
  }, [openItems, resolutions]);
  const [priceGroups, setPriceGroups] = useState<Record<string, SalePriceGroup[]>>(() => Object.fromEntries(transaction.items.map((item) => [item.itemId, item.salePriceGroups?.length ? item.salePriceGroups : [{ quantity: item.requestedQuantity, unitPrice: item.soldPrice ?? "", total: item.soldTotal ?? "" }]])));
  const salePricing = useMemo(() => {
    let error: string | null = null;
    const groups = Object.fromEntries(Object.entries(priceGroups).map(([itemId, entries]) => [itemId, entries.map((group) => {
      try {
        return { ...group, total: calculateSaleGroupTotal(group.quantity, group.unitPrice) };
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Invalid sale price.";
        return { ...group, total: "" };
      }
    })]));
    let grandTotal = "";
    if (!error) {
      try { grandTotal = calculateSaleGrandTotal(Object.values(groups).flat()); }
      catch (cause) { error = cause instanceof Error ? cause.message : "Invalid sale total."; }
    }
    return { groups, grandTotal, error };
  }, [priceGroups]);
  const [savingPriceDraft, setSavingPriceDraft] = useState(false);
  const [priceDraftSaved, setPriceDraftSaved] = useState(false);

  async function savePriceDraft() {
    if (savingPriceDraft || !transaction.requiresSoldPriceApproval) return;
    if (salePricing.error) { setError(salePricing.error); return; }
    setSavingPriceDraft(true);
    setError(null);
    setPriceDraftSaved(false);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/sale-price-draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priceGroups: salePricing.groups, soldPrice: salePricing.grandTotal }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to save price draft.");
      setPriceDraftSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save price draft."); }
    finally { setSavingPriceDraft(false); }
  }
  const projectOptions = projects.map((project) => ({
    label: formatProjectLabel(project),
    searchText: [project.customerName, project.name, project.projectId].filter(Boolean).join(" "),
    value: project.id,
  }));

  async function handleExport() {
    setIsExporting(true);
    setError(null);
    try {
      await downloadTransactionPdf(transaction.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to export PDF.");
    } finally {
      setIsExporting(false);
    }
  }

  useEffect(() => {
    const storedHref = window.localStorage.getItem("stock:lastInventoryHref");

    if (storedHref) {
      setLastInventoryHref(storedHref);
    }
  }, []);

  const addItemHref = useMemo(() => {
    const [pathAndSearch, hash] = lastInventoryHref.split("#");
    const [pathname, search = ""] = pathAndSearch.split("?");
    const params = new URLSearchParams(search);
    params.set("pendingTransactionId", transaction.id);
    const nextHref = `${pathname}?${params.toString()}`;

    return hash ? `${nextHref}#${hash}` : nextHref;
  }, [lastInventoryHref, transaction.id]);

  function resolutionMaximum(item: TransactionReturnItem) {
    return availableReturnQuantity(item, transaction.outcomes, resolutionBatchId);
  }

  async function deletePendingOutcome(outcomeId: string) {
    if (!window.confirm("Remove this pending outcome?")) return;

    setDeletingOutcomeId(outcomeId);
    setError(null);
    try {
      const response = await fetch(
        `/api/transactions/${transaction.id}/return?outcomeId=${encodeURIComponent(outcomeId)}`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Unable to remove pending outcome.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove pending outcome.");
    } finally {
      setDeletingOutcomeId(null);
    }
  }

  function allocationMaximum(item: TransactionReturnItem, index: number) {
    const allocations = resolutions[item.itemId]?.allocations ?? [
      { quantity: item.requestedQuantity, toStatus: "READY" as AssetStatus, note: "", soldPrice: "" },
    ];
    const otherQuantity = allocations.reduce(
      (sum, allocation, allocationIndex) => allocationIndex === index ? sum : sum + allocation.quantity,
      0,
    );
    return Math.max(1, resolutionMaximum(item) - otherQuantity);
  }

  function quantityMismatch(item: TransactionReturnItem) {
    if (!item.isQuantityAsset) return null;
    const expected = resolutionMaximum(item);
    const total = resolutions[item.itemId]?.allocations.reduce(
      (sum, allocation) => sum + allocation.quantity,
      0,
    ) ?? item.requestedQuantity;
    if (total <= expected) return null;
    return `Total QTY exceeds available return quantity (${total}/${expected}).`;
  }

  async function savePendingEdit() {
    if (Object.keys(editQuantityErrors).length > 0) {
      setError("Please correct the quantity before saving.");
      return;
    }
    if ((editScope === "project" && !editProjectId) || (editScope !== "project" && !editPurpose.trim())) {
      setError(editScope === "project" ? "Project is required." : "Customer Name is required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        body: JSON.stringify({
          items: editItems.map((item) => ({
            assetId: item.assetId,
            quantity: item.quantity,
          })),
          internalRequest: editScope === "internal",
          note: editNote.trim() || null,
          projectId: editScope === "project" ? editProjectId : null,
          projectRequest: editScope === "project",
          purpose: editScope === "project" ? projects.find((project) => project.id === editProjectId)?.name ?? "Project" : editPurpose.trim(),
          serviceRequest: editScope === "service",
          type: editType,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to update request.");
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function removeEditItem(assetId: string) {
    setEditItems((items) => items.filter((item) => item.assetId !== assetId));
  }

  function updateEditItemQuantity(assetId: string, quantity: number) {
    const item = editItems.find((candidate) => candidate.assetId === assetId);
    const maximum = item?.availableQuantity ?? quantity;
    const exceeds = quantity > maximum;
    setEditQuantityErrors((current) => {
      const next = { ...current };
      if (exceeds) next[assetId] = `Cannot exceed available stock (${maximum})`;
      else delete next[assetId];
      return next;
    });
    setEditItems((items) =>
      items.map((item) =>
        item.assetId === assetId
          ? { ...item, quantity: item.isQuantityAsset ? Math.min(item.availableQuantity, Math.max(1, quantity)) : 1 }
          : item,
      ),
    );
  }

  function addResolutionSplit(itemId: string, maximum: number) {
    setResolutions((current) => {
      const state = current[itemId];
      if (!state || maximum <= 1 || state.allocations.length >= 10) return current;
      const used = state.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      const remaining = maximum - used;
      if (remaining <= 0) return current;
      return { ...current, [itemId]: { ...state, allocations: [...state.allocations, { quantity: remaining, toStatus: AssetStatus.READY, returnCondition: "NEW", note: "", soldPrice: "" }] } };
    });
  }

  function updateResolutionAllocation(itemId: string, index: number, patch: Partial<{ quantity: number; toStatus: AssetStatus; returnCondition: "NEW" | "USED" | null; note: string; soldPrice: string }>) {
    setResolutions((current) => {
      const state = current[itemId];
      if (!state) return current;
      const allocations = state.allocations.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, ...patch } : allocation);
      return { ...current, [itemId]: { ...state, allocations, quantity: allocations[0]?.quantity ?? 1, toStatus: allocations[0]?.toStatus ?? "READY" } };
    });
  }

  function removeResolutionSplit(itemId: string, index: number) {
    setResolutions((current) => {
      const state = current[itemId];
      if (!state) return current;
      return { ...current, [itemId]: removeResolutionAllocation(state, index) };
    });
    setQuantityErrors((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${itemId}-`)),
    ));
  }

  function toggleResolutionItem(itemId: string) {
    setResolutions((current) => {
      const state = current[itemId];
      return state ? { ...current, [itemId]: { ...state, selected: !state.selected } } : current;
    });
  }

  function updateResolutionQuantity(itemId: string, index: number, value: number, maximum: number) {
    const exceeds = value > maximum;
    setQuantityErrors((current) => {
      const next = { ...current };
      const key = `${itemId}-${index}`;
      if (exceeds) next[key] = `Cannot exceed available stock (${maximum})`;
      else delete next[key];
      return next;
    });
    updateResolutionAllocation(itemId, index, { quantity: Math.min(maximum, Math.max(1, value || 1)) });
  }

  function openApproval(mode: "APPROVE" | "REJECT") {
    setError(null);
    setRejectReason("");

    if (!canOpenReturnApproval(transaction.canApprove, transaction.approvalTag, mode)) {
      setError(transaction.rejectBlockedReason ?? "No approval is waiting for this user.");
      return;
    }

    setApprovalMode(mode);
  }

  async function confirmApproval() {
    if (!canOpenReturnApproval(transaction.canApprove, transaction.approvalTag, approvalMode ?? "APPROVE")) return;
    if (approvalMode === "APPROVE" && !transaction.isAcknowledgement && !transaction.hasSignature) {
      router.push("/dashboard/settings");
      return;
    }

    if (approvalMode === "APPROVE" && transaction.requiresSoldPriceApproval) {
      const missingPrice = transaction.items.some((item) => {
        try { validateSalePriceGroups(salePricing.groups[item.itemId] ?? [], item.requestedQuantity, !item.isQuantityAsset, false); return false; }
        catch { return true; }
      });
      if (missingPrice || salePricing.error) {
        setError(salePricing.error ?? "Enter Price / unit and allocate QTY for every sold item.");
        return;
      }
    }

    if (approvalMode === "REJECT" && !rejectReason.trim()) {
      setError("Reject reason is required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const endpoint = approvalMode === "REJECT" ? "reject" : "approve";
      const response = await fetch(`/api/transactions/${transaction.id}/${endpoint}`, {
        body: JSON.stringify(
          approvalMode === "REJECT"
            ? { reason: rejectReason.trim() }
            : {
                comment: null,
                priceGroups: transaction.requiresSoldPriceApproval ? salePricing.groups : undefined,
                soldPrice: transaction.requiresSoldPriceApproval ? salePricing.grandTotal : null,
              },
        ),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to update approval.");
      }

      setApprovalMode(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update approval.");
    } finally {
      setIsSubmitting(false);
    }
  }
  function handleSubmit() {
    if (!transaction.canReturn) {
      setError(transaction.returnBlockedReason ?? "This transaction cannot be returned.");
      return;
    }

    const selectedItems = openItems.filter((item) => resolutions[item.itemId]?.selected);
    if (selectedItems.length === 0) {
      setError("This transaction has no open items.");
      return;
    }

    for (const item of selectedItems) {
      if (!item.isQuantityAsset) continue;
      const returnMaximum = resolutionMaximum(item);
      const total = resolutions[item.itemId]?.allocations.reduce(
        (sum, allocation) => sum + allocation.quantity,
        0,
      ) ?? 0;
      if (total <= 0 || total > returnMaximum) {
        setError(quantityMismatch(item) ?? `${item.model}: Select a valid return quantity.`);
        return;
      }
    }

    setError(null);
    setConfirmationMode(
      selectedItems.some((item) => resolutions[item.itemId]?.allocations.some((allocation) => allocation.toStatus === "SOLD"))
        ? "SOLD"
        : "RETURN",
    );
  }

  async function confirmSubmit() {
    if (cancellingBatchId || !transaction.canReturn || (resolutionBatchId && !transaction.editableReturnBatches.some((batch) => batch.id === resolutionBatchId))) return;
    const items = openItems.filter((item) => resolutions[item.itemId]?.selected).map((item) => {
      const toStatus = resolutions[item.itemId]?.toStatus ?? "READY";

      return {
        itemId: item.itemId,
        allocations: (resolutions[item.itemId]?.allocations ?? [{ quantity: item.requestedQuantity, toStatus, returnCondition: "NEW", note: "", soldPrice: "" }]).map((allocation) => ({
          ...allocation,
          returnCondition: allocation.toStatus === AssetStatus.READY ? allocation.returnCondition ?? "NEW" : undefined,
        })),
        soldPrice: null,
        toStatus,
      };
    });

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/transactions/${transaction.id}/return`, {
        body: JSON.stringify({ items, resolutionBatchId: resolutionBatchId || undefined }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to resolve transaction.");
      }

      setConfirmationMode(null);
      router.push("/logs");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to resolve transaction.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm font-bold"
          >
            <Link className="text-navy transition hover:text-brand-accent" href="/logs">
              Logs
            </Link>
            <span className="text-muted-foreground">&gt;</span>
            <Link
              className="text-navy transition hover:text-brand-accent"
              href={`/logs/${transaction.id}/return`}
            >
              {transaction.transactionNo}
            </Link>
          </nav>
          <h1 className="mt-3 text-3xl font-bold text-navy">
            Resolve Transaction
          </h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {transaction.kindLabel} request by {transaction.requestedBy}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {transaction.canApprove ? (
            transaction.isAcknowledgement ? (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-bold text-white hover:bg-brand-accent/90"
                onClick={() => openApproval("APPROVE")}
                type="button"
              >
                <CheckCircle2 className="h-4 w-4" />
                Acknowledge
              </button>
            ) : (
              <>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-status-fail bg-white px-4 text-sm font-bold text-status-fail hover:bg-status-fail/10"
                  onClick={() => openApproval("REJECT")}
                  type="button"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                {!transaction.approvalTag?.startsWith("RETURN_CHECK:") ? <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-bold text-white hover:bg-brand-accent/90"
                  onClick={() => openApproval("APPROVE")}
                  type="button"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button> : null}
              </>
            )
          ) : null}
          {canExportAnytime ? (
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isExporting}
              onClick={handleExport}
              type="button"
            >
              <FileDown className="h-4 w-4" />
              {isExporting ? "Exporting..." : "Export PDF"}
            </button>
          ) : null}
        </div>
      </header>

      <section className="rounded-md border border-border bg-white p-5 shadow-sm">
        <div className="border-b border-border pb-4">
          <h2 className="text-xl font-bold text-navy">Transaction Summary</h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Complete request information for approval and confirmation.
          </p>
        </div>
        <div className="grid gap-6 pt-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-900">Requisitioner</p>
              <div className="min-w-0 text-sm font-normal text-ink">
                <p>{transaction.requisitionerName}</p>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-900">Lead Project / Supervisor</p>
              <p className="min-w-0 text-sm font-normal text-ink">{transaction.leadSupervisorName || "-"}</p>
            </div>
            <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-900">Request Date</p>
              <p className="min-w-0 text-sm font-normal text-ink">
                {formatReturnDate(transaction.requestDate)}
              </p>
            </div>
          </div>
          <div className="space-y-4 lg:border-l lg:border-border lg:pl-6">
            <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-900">Customer / Project</p>
              <p className="min-w-0 text-sm font-normal text-ink">
                {transaction.projectName
                  ? formatProjectLabel({ name: transaction.projectName, customerName: transaction.customerName, projectId: transaction.projectCode })
                  : transaction.customerName || "-"}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-900">Detail</p>
              <p className={transaction.note ? "min-w-0 whitespace-pre-wrap text-sm font-normal text-ink" : "min-w-0 text-sm italic text-gray-400"}>
                {transaction.note?.trim() || "-"}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-900">Return Date</p>
              <p className="min-w-0 text-sm font-normal text-ink">
                {transaction.returnDate
                  ? formatReturnDate(transaction.returnDate)
                  : ""}
              </p>
            </div>
          </div>
        </div>
      </section>

      {transaction.workflowStatus === "REJECTED" && transaction.rejectReason ? (
        <section className="rounded-md border border-status-fail bg-status-fail/10 p-4 shadow-sm">
          <h2 className="text-lg font-bold text-status-fail">Request Rejected</h2>
          <p className="mt-2 text-sm font-semibold text-ink">{transaction.rejectReason}</p>
          <p className="mt-2 text-xs font-bold uppercase text-muted-foreground">
            {transaction.rejectedBy ? `Rejected by ${transaction.rejectedBy}` : "Rejected"}
            {transaction.rejectedAt ? ` on ${formatReturnDate(transaction.rejectedAt)}` : ""}
          </p>
        </section>
      ) : null}

      {transaction.canEditPendingRequest ? (
        <section className="rounded-md border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[180px_minmax(0,1fr)_180px]">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase text-ink">Transaction Type</span>
              <SearchableDropdown
                onChange={(value) => {
                  const nextType = value as TransactionType;
                  setEditType(nextType);
                  if (nextType === "USING") {
                    setEditScope("internal");
                  } else if (editScope === "internal") {
                    setEditScope("service");
                  }
                }}
                options={[
                  { label: "Borrow", value: "BORROW" },
                  { label: "Using", value: "USING" },
                  { label: "Sold", value: "SOLD" },
                ]}
                placeholder="Select transaction type"
                searchPlaceholder="Search transaction type"
                value={editType}
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase text-ink">
                {editType === "USING" ? "Internal" : editScope === "project" ? "Project" : "Customer Name"}
              </span>
              {editType === "USING" ? (
                <div className="flex h-11 items-center rounded-md border border-border bg-surface/40 px-3 text-sm font-semibold text-navy">
                  Internal use
                </div>
              ) : editScope === "project" ? (
                <SearchableDropdown
                  emptyText="No active projects found."
                  onChange={setEditProjectId}
                  options={projectOptions}
                  placeholder="Select project"
                  searchPlaceholder="Search project"
                  value={editProjectId}
                />
              ) : (
                <input
                  className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4"
                  onChange={(event) => setEditPurpose(event.target.value)}
                  placeholder="Enter customer name"
                  value={editPurpose}
                />
              )}
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase text-ink">Scope</span>
              <SearchableDropdown
                disabled={editType === "USING"}
                onChange={(value) => {
                        const nextScope = value as "internal" | "service" | "project";
                        setEditScope(nextScope);
                        if (nextScope !== "project") setEditProjectId("");
                        if (nextScope === "project" || nextScope === "internal") setEditPurpose("");
                      }}
                options={editType === "USING"
                  ? [{ label: "Internal", value: "internal" }]
                  : [
                      { label: "Service", value: "service" },
                      { label: "Project", value: "project" },
                    ]
                }
                placeholder="Select scope"
                searchPlaceholder="Search scope"
                value={editType === "USING" ? "internal" : editScope}
              />
            </label>
          </div>
          <label className="mt-4 flex flex-col gap-2">
            <span className="text-xs font-bold uppercase text-ink">Note</span>
            <textarea
              className="min-h-24 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-ink outline-none ring-brand-accent/20 focus:ring-4"
              onChange={(event) => setEditNote(event.target.value)}
              value={editNote}
            />
          </label>
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <div className="flex justify-end border-b border-border bg-surface px-4 py-3">
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-black"
                href={addItemHref}
              >
                Add Item
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-left text-sm">
                <thead className="bg-surface text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-[34%] px-4 py-3 font-bold">Asset</th>
                    <th className="w-[22%] px-4 py-3 font-bold">Stock Code</th>
                    <th className="w-[22%] px-4 py-3 font-bold">Serial No.</th>
                    <th className="w-[12%] px-4 py-3 font-bold">Qty</th>
                    <th className="w-[10%] px-4 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {editItems.map((item) => (
                    <tr key={item.assetId}>
                      <td className="truncate px-4 py-3 font-bold text-navy" title={item.model}>
                        {item.model}
                      </td>
                      <td className="truncate px-4 py-3 font-medium text-ink" title={fallback(item.stockCode)}>
                        {fallback(item.stockCode)}
                      </td>
                      <td className="truncate px-4 py-3 font-medium text-ink" title={fallback(item.serialNo)}>
                        {fallback(item.serialNo)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="h-9 w-20 rounded-md border border-border bg-white px-2 text-sm font-bold text-navy outline-none ring-brand-accent/20 focus:ring-4 disabled:bg-surface"
                          disabled={!item.isQuantityAsset}
                          max={item.availableQuantity}
                          min={1}
                          onChange={(event) =>
                            updateEditItemQuantity(item.assetId, Number(event.target.value) || 1)
                          }
                          type="number"
                          value={item.isQuantityAsset ? item.quantity : 1}
                        />
                        {item.isQuantityAsset && editQuantityErrors[item.assetId] ? <p className="mt-1 text-xs font-semibold text-status-fail">{editQuantityErrors[item.assetId]}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-sm font-bold text-status-fail hover:underline"
                          onClick={() => removeEditItem(item.assetId)}
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {editItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm font-semibold text-muted-foreground" colSpan={5}>
                        No request items.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand-accent px-4 text-sm font-bold text-white hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              onClick={savePendingEdit}
              type="button"
            >
              Save Pending Request
            </button>
          </div>
        </section>
      ) : null}

      {!transaction.canReturn ? (
        <p className="flex gap-2 rounded-md bg-status-request/10 p-3 text-sm font-semibold text-navy">
          <AlertCircle className="h-4 w-4 shrink-0 text-status-request" />
          {transaction.returnBlockedReason ?? "Return actions are disabled."}
        </p>
      ) : null}

      {transaction.approvalBlockedReason && (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-status-fail">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {transaction.approvalBlockedReason}
        </p>
      )}

      {transaction.sourceTransactionId && (
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-accent hover:underline" href={`/logs/${encodeURIComponent(transaction.sourceTransactionId)}/return`}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Source Return Request
        </Link>
      )}

      {transaction.editableReturnBatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-navy">
          Return Round
          <select
            aria-label="Return round"
            className="h-10 max-w-full rounded-md border border-border bg-white px-3"
            disabled={isSubmitting || cancellingBatchId !== null}
            value={resolutionBatchId}
            onChange={(event) => selectReturnBatch(event.target.value)}
          >
            <option value="">New round</option>
            {transaction.editableReturnBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.requestNo} / {batch.phase}</option>)}
          </select>
        </label>
        {resolutionBatchId && (
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-status-fail px-3 text-sm font-semibold text-status-fail disabled:opacity-50" disabled={isSubmitting || cancellingBatchId !== null} onClick={() => void cancelReturnBatch(resolutionBatchId)}>
            {cancellingBatchId ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <XCircle aria-hidden="true" className="h-4 w-4" />}
            Cancel Round
          </button>
        )}
        </div>
      )}

      <section className="scroll-mt-6 overflow-hidden rounded-md border border-border bg-white shadow-sm" id="sale-pricing">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy">{transaction.requiresSoldPriceApproval ? "Sale Pricing" : "Request Items"}</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {transaction.canReturn
                ? "Select the final outcome for each open asset."
                : "Review the approval step and requested assets."}
            </p>
          </div>
          <span className="text-sm font-bold text-navy">
            {openItems.length} open / {transaction.items.length} total
            {transaction.items.some((item) => item.requestedQuantity > 1) ? (
              <span className="ml-2 text-xs font-semibold text-muted-foreground">
                ({openQuantity} qty remaining)
              </span>
            ) : null}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-[18%] px-5 py-4 font-bold">Asset / Model</th>
                <th className="w-[11%] px-5 py-4 font-bold">Category</th>
                <th className="w-[11%] px-5 py-4 font-bold">Type</th>
                <th className="w-[12%] px-5 py-4 font-bold">Part No.</th>
                <th className="w-[10%] px-5 py-4 font-bold">Brand</th>
                <th className="w-[11%] px-5 py-4 font-bold">Stock Code</th>
                <th className="w-[14%] px-5 py-4 font-bold">Serial No.</th>
                <th className="w-20 px-5 py-4 text-right font-bold">QTY</th>
                <th className="w-[13%] px-5 py-4 font-bold">Current Step</th>
                <th className="w-[16%] px-5 py-4 font-bold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transaction.items.map((item) => {
                const isResolved = Boolean(item.resolvedAt) && item.resolvedQuantity >= item.requestedQuantity;
                const isAwaitingOutcomeApproval = item.hasPendingOutcome && !openItems.some((candidate) => candidate.itemId === item.itemId);
                const state = resolutions[item.itemId];

                return (
                  <tr className="align-middle" key={item.itemId}>
                    <td className="px-5 py-4">
                      <div className="flex min-w-0 items-start gap-3">
                        {!isResolved && !isAwaitingOutcomeApproval && transaction.canReturn && item.availableQuantity > 0 ? (
                          <input
                            aria-label={`Select ${item.model} for return`}
                            checked={state?.selected ?? false}
                            className="mt-1 h-4 w-4 accent-brand-accent"
                            onChange={() => toggleResolutionItem(item.itemId)}
                            type="checkbox"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                        <Link
                          className="block break-words font-bold text-navy hover:text-brand-accent"
                          href={`/dashboard/assets/${item.assetId}`}
                          title={item.model}
                        >
                          {item.model}
                        </Link>
                        {transaction.requiresSoldPriceApproval ? (
                          <div className="mt-3 w-full min-w-0 space-y-3">
                            {(salePricing.groups[item.itemId] ?? []).map((group, index) => (
                              <div key={index} className="flex min-w-0 items-start gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
                                <div className="min-w-0 flex-1 space-y-2">
                                {(["quantity", "unitPrice", "total"] as const).map((field) => (
                                  <label key={field} className="block text-xs text-muted-foreground">
                                    {field === "quantity" ? "QTY" : field === "unitPrice" ? "Price / unit" : "Group total"}
                                    <input
                                      aria-label={`${item.model} group ${index + 1} ${field}`}
                                      className={`mt-1 h-9 w-full min-w-0 rounded-md border border-border px-2 font-bold tabular-nums text-navy ${field === "total" ? "bg-surface/50" : "bg-white"}`}
                                      type={field === "quantity" ? "number" : "text"}
                                      inputMode={field === "quantity" ? "numeric" : "decimal"}
                                      min={field === "quantity" ? 1 : undefined}
                                      max={field === "quantity" ? clampSaleGroupQuantity(priceGroups[item.itemId], index, item.requestedQuantity, item.requestedQuantity, !item.isQuantityAsset) : undefined}
                                      readOnly={field === "total" || (field === "quantity" && (!item.isQuantityAsset || item.requestedQuantity === 1))}
                                      step={field === "quantity" ? 1 : undefined}
                                      placeholder={field === "quantity" ? undefined : "0.00"}
                                      value={group[field]}
                                      onChange={field === "total" ? undefined : (event) => {
                                        const value = event.target.value;
                                        if (field === "unitPrice" && !/^\d*(\.\d{0,2})?$/.test(value)) return;
                                        setPriceDraftSaved(false);
                                        setPriceGroups((current) => ({ ...current, [item.itemId]: current[item.itemId].map((entry, position) => position === index ? { ...entry, [field]: field === "quantity" ? clampSaleGroupQuantity(current[item.itemId], index, item.requestedQuantity, Number(value), !item.isQuantityAsset) : value } : entry) }));
                                      }}
                                      onBlur={field === "unitPrice" ? () => {
                                        if (!group.unitPrice.trim()) return;
                                        try {
                                          const unitPrice = normalizeSaleMoney(group.unitPrice);
                                          setPriceGroups((current) => ({ ...current, [item.itemId]: current[item.itemId].map((entry, position) => position === index ? { ...entry, unitPrice } : entry) }));
                                        } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid sale price."); }
                                      } : undefined}
                                    />
                                  </label>
                                ))}
                                </div>
                                {(priceGroups[item.itemId]?.length ?? 0) > 1 ? (
                                  <button
                                    aria-label={`Remove price group ${index + 1} for ${item.model}`}
                                    className="mt-5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-status-fail transition hover:bg-status-fail/10 disabled:opacity-50"
                                    disabled={isSubmitting || savingPriceDraft}
                                    onClick={() => {
                                      setPriceDraftSaved(false);
                                      setPriceGroups((current) => ({ ...current, [item.itemId]: current[item.itemId].filter((_, position) => position !== index) }));
                                    }}
                                    title="Remove price group"
                                    type="button"
                                  >
                                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                            {item.isQuantityAsset && item.requestedQuantity > 1 ? <button type="button" className="text-xs font-bold text-coral disabled:opacity-40" disabled={priceGroups[item.itemId].length >= item.requestedQuantity} onClick={() => { setPriceDraftSaved(false); setPriceGroups((current) => {
                              const groups = current[item.itemId];
                              const splitIndex = groups.findIndex((group) => group.quantity > 1);
                              return { ...current, [item.itemId]: [...groups.map((group, index) => index === splitIndex ? { ...group, quantity: group.quantity - 1 } : group), { quantity: 1, unitPrice: "", total: "" }] };
                            }); }}>+ Split price</button> : null}
                          </div>
                        ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.category)}>
                      {fallback(item.category)}
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.typeName)}>
                      {fallback(item.typeName)}
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.partNo)}>
                      {fallback(item.partNo)}
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.brand)}>
                      {fallback(item.brand)}
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.stockCode)}>
                      {fallback(item.stockCode)}
                    </td>
                    <td className="px-5 py-4 font-medium text-ink" title={fallback(item.serialNo)}>
                      {fallback(item.serialNo)}
                      {item.canConfirmSerial ? (
                        <div className="mt-2 space-y-2">
                        <select
                          aria-label={`Serial number for ${item.model}`}
                          className="h-9 w-full min-w-32 rounded-md border border-border bg-white px-2 text-xs text-ink"
                          disabled={Boolean(confirmingSerialId)}
                          onFocus={() => void loadSerialOptions(item)}
                          onPointerDown={() => void loadSerialOptions(item)}
                          onChange={(event) => setSelectedSerials((current) => ({ ...current, [item.itemId]: event.target.value }))}
                          value={selectedSerials[item.itemId] ?? item.assetId}
                        >
                          <option value={item.assetId}>{item.serialNo}</option>
                          {(serialOptions[item.itemId] ?? []).filter((option) => option.id !== item.assetId).map((option) => (
                            <option key={option.id} value={option.id}>{option.serialNo}{option.stockCode ? ` / ${option.stockCode}` : ""}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="mt-2 flex items-center gap-1 text-xs font-bold text-coral disabled:opacity-50"
                          disabled={Boolean(confirmingSerialId)}
                          onClick={() => confirmIssueSerial(item)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {confirmingSerialId === item.itemId ? "Confirming..." : "Confirm serial"}
                        </button>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-right font-bold tabular-nums text-ink">
                      {item.requestedQuantity.toLocaleString("en-US")}
                    </td>
                    <td className="truncate px-5 py-4 font-semibold text-ink" title={item.currentStep}>
                      {item.currentStep}
                    </td>
                    <td className="px-5 py-4">
                      {isResolved && item.resolvedStatus ? (
                        <AssetStatusBadge status={item.resolvedStatus} />
                      ) : isAwaitingOutcomeApproval ? (
                        <span className="text-sm font-bold text-muted-foreground">
                          Awaiting approval
                        </span>
                      ) : transaction.canReturn && item.availableQuantity > 0 ? (
                        <div className="space-y-2">
                          {(state?.allocations ?? [{ quantity: item.requestedQuantity, toStatus: AssetStatus.READY, returnCondition: "NEW", note: "", soldPrice: "" }]).map((allocation, index) => (
                            <div className="flex flex-wrap items-center gap-2" key={`${item.itemId}-${index}`}>
                              <div className="flex w-full min-w-0 items-center gap-2">
                                <div className="min-w-0 flex-1">
                                  <SearchableDropdown
                                    onChange={(value) => updateResolutionAllocation(item.itemId, index, classifyReturnOutcome(value, item.isQuantityAsset))}
                                    options={getReturnResolutionOptions(item.isQuantityAsset)}
                                    portal
                                    placeholder="Outcome"
                                    searchPlaceholder="Search outcome"
                                    value={allocation.toStatus === AssetStatus.READY && allocation.returnCondition === "USED" ? "USED" : allocation.toStatus}
                                  />
                                </div>
                                {(state?.allocations.length ?? 1) > 1 ? (
                                  <button
                                    aria-label={`Remove outcome ${index + 1} for ${item.model}`}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-status-fail transition hover:bg-status-fail/10 disabled:opacity-50"
                                    disabled={isSubmitting}
                                    onClick={() => removeResolutionSplit(item.itemId, index)}
                                    title="Remove outcome"
                                    type="button"
                                  >
                                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                              {item.isQuantityAsset ? (
                                <input
                                  aria-label={`Quantity for ${item.model}`}
                                  className="h-9 w-20 rounded-md border border-border px-2 text-sm font-bold text-navy"
                                  max={allocationMaximum(item, index)}
                                  min={1}
                                  onChange={(event) => updateResolutionQuantity(item.itemId, index, Number(event.target.value), allocationMaximum(item, index))}
                                  type="number"
                                  value={allocation.quantity}
                                />
                              ) : null}
                              <input
                                aria-label={`Remark for ${item.model} outcome ${index + 1}`}
                                className="h-9 min-w-40 flex-1 rounded-md border border-border px-2 text-xs font-medium text-navy"
                                onChange={(event) => updateResolutionAllocation(item.itemId, index, { note: event.target.value })}
                                placeholder="Remark"
                                value={allocation.note}
                              />
                              {item.isQuantityAsset && quantityErrors[`${item.itemId}-${index}`] ? <p className="text-xs font-semibold text-status-fail">{quantityErrors[`${item.itemId}-${index}`]}</p> : null}
                            </div>
                          ))}
                          {item.isQuantityAsset && resolutionMaximum(item) > 1 && (state?.allocations.length ?? 1) < 10 ? (
                            <button
                              className="text-xs font-bold text-brand-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={(state?.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) ?? item.requestedQuantity) >= resolutionMaximum(item)}
                              onClick={() => addResolutionSplit(item.itemId, resolutionMaximum(item))}
                              type="button"
                            >
                              + Split outcome
                            </button>
                          ) : null}
                          {quantityMismatch(item) ? (
                            <p className="text-xs font-semibold text-status-fail">
                              {quantityMismatch(item)}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">
                          {item.currentStep}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {transaction.outcomes.length > 0 ? (
        <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-xl font-bold text-navy">Returned / Outcome Summary</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Approved and pending outcomes for this request.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3">Asset</th><th className="px-5 py-3">Outcome</th><th className="px-5 py-3">Qty</th><th className="px-5 py-3">Return Condition</th><th className="px-5 py-3">Price / Unit</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Remark</th><th className="px-5 py-3">Approval</th><th className="px-5 py-3">Action</th></tr></thead>
              <tbody className="divide-y divide-border">
                {transaction.outcomes.map((outcome) => {
                  return (
                  <tr key={outcome.id}>
                    <td className="px-5 py-3 font-bold text-navy">{outcome.model}<div className="text-xs font-medium text-muted-foreground">{outcome.serialNo ?? outcome.stockCode ?? "-"}</div></td>
                    <td className="px-5 py-3"><AssetStatusBadge status={outcome.outcomeStatus} /></td>
                    <td className="px-5 py-3 font-bold">{outcome.quantity}</td>
                    <td className="px-5 py-3">
                      {outcome.returnCondition ?? "-"}
                    </td>
                    <td className="px-5 py-3">{outcome.soldPrice ? Number(outcome.soldPrice).toFixed(2) : "-"}</td>
                    <td className="px-5 py-3 font-bold">{outcome.soldTotal != null ? Number(outcome.soldTotal).toFixed(2) : "-"}</td>
                    <td className="px-5 py-3 text-xs">{outcome.note || "-"}</td>
                    <td className="px-5 py-3">{outcome.approvedAt ? formatReturnDate(outcome.approvedAt) : "Pending approval"}</td>
                    <td className="px-5 py-3">
                      {outcome.canDelete ? (
                        <button
                          aria-label={`Remove pending outcome for ${outcome.model}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-status-fail hover:underline disabled:opacity-50"
                          disabled={deletingOutcomeId === outcome.id}
                          onClick={() => void deletePendingOutcome(outcome.id)}
                          type="button"
                        >
                          <XCircle className="h-4 w-4" />
                          Remove
                        </button>
                      ) : "-"}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {soldSummary.count > 0 ? (
        <div className="flex justify-end rounded-md border border-brand-accent/30 bg-brand-accent/5 px-5 py-4 text-right">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Grand Total</p>
            <p className="text-xl font-bold text-navy">{soldSummary.total.toFixed(2)}</p>
          </div>
        </div>
      ) : null}

      {transaction.requiresSoldPriceApproval ? (
        <div className="flex justify-end rounded-md border border-brand-accent/30 bg-brand-accent/5 px-5 py-4 text-right">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Grand Total</p>
            <input aria-label="Grand Total" className="mt-2 h-10 rounded-md border border-border bg-surface/50 px-3 text-right font-bold tabular-nums text-navy" type="text" inputMode="decimal" readOnly value={salePricing.grandTotal} />
            {salePricing.error ? <p className="mt-2 text-sm font-semibold text-status-fail" role="alert">{salePricing.error}</p> : null}
            <div className="mt-3 flex items-center justify-end gap-3">
              {priceDraftSaved ? <span className="text-sm text-green-700" role="status">Draft saved</span> : null}
              <button type="button" onClick={savePriceDraft} disabled={savingPriceDraft || isSubmitting || Boolean(salePricing.error)} className="h-10 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy disabled:opacity-50">{savingPriceDraft ? "Saving..." : "Save Price Draft"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {transaction.canReturn ? (
      <div className="flex flex-wrap justify-end gap-3">
        <Link
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-5 text-sm font-bold text-navy hover:bg-surface"
          href="/logs"
        >
          Cancel
        </Link>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-5 text-sm font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || cancellingBatchId !== null || openItems.every((item) => !resolutions[item.itemId]?.selected) || !transaction.canReturn || Object.keys(quantityErrors).length > 0 || openItems.some((item) => resolutions[item.itemId]?.selected && Boolean(quantityMismatch(item)))}
          onClick={handleSubmit}
          type="button"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {resolutionBatchId ? "Resubmit Outcomes" : "Save Outcomes"}
        </button>
      </div>
      ) : null}

      {approvalMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section className="w-full max-w-md rounded-md border border-border bg-white p-5 shadow-xl">
            <h2 className="text-xl font-bold text-navy">
              {approvalMode === "APPROVE" ? transaction.isAcknowledgement ? "Acknowledge Request" : "Approve Request" : "Reject Request"}
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {approvalMode === "APPROVE"
                ? transaction.isAcknowledgement ? "Confirm that you acknowledge this request." : "Confirm that you approve this request."
                : "Please provide a reject reason. The requested assets will be released."}
            </p>

            {error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}

            {approvalMode === "APPROVE" && !transaction.isAcknowledgement && !transaction.hasSignature && !error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {missingSignatureMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-4">
              {approvalMode === "REJECT" ? (
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase text-ink">Reject Reason</span>
                  <textarea
                    className="min-h-28 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-ink outline-none ring-brand-accent/20 focus:ring-4"
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Reason for rejection"
                    value={rejectReason}
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                className="h-10 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy hover:bg-surface"
                disabled={isSubmitting}
                onClick={() => setApprovalMode(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-bold text-white hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={confirmApproval}
                type="button"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {approvalMode === "APPROVE" && !transaction.isAcknowledgement && !transaction.hasSignature ? "Go to Settings" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmationMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section className="w-full max-w-md rounded-md border border-border bg-white p-5 shadow-xl">
            <h2 className="text-xl font-bold text-navy">
              {confirmationMode === "SOLD" ? "Confirm Sale" : "Confirm Return"}
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {confirmationMode === "SOLD"
                ? "These assets will be sent to the sale approval workflow. BSD Staff will enter the sale price before approval."
                : "These assets will be sent to the return approval workflow before the asset status changes."}
            </p>

            {error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                className="h-10 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy hover:bg-surface"
                disabled={isSubmitting}
                onClick={() => setConfirmationMode(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={confirmSubmit}
                type="button"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}



