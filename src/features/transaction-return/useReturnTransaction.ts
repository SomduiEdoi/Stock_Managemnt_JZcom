"use client";
import { formatProjectLabel } from "@/lib/project-label";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetStatus, type TransactionType } from "@prisma/client";
import { downloadTransactionPdf } from "@/features/transactions/transaction-pdf-download";
import { availableReturnQuantity } from "./return-quantity";
import {
  calculateSaleGrandTotal,
  calculateSaleGroupTotal,
  validateSalePriceGroups,
  type SalePriceGroup,
} from "@/lib/sale-price-groups";
import {
  EditableRequestItem,
  ResolutionState,
  TransactionReturnItem,
  buildReturnBatchRevision,
  canOpenReturnApproval,
  hasOpenReturnQuantity,
  removeResolutionAllocation,
} from "./return-transaction-state";
import type {
  TransactionProjectOption,
  TransactionReturnRecord,
} from "./return-transaction-state";

export function useReturnTransaction({
  projects,
  transaction,
}: {
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
  const [approvalMode, setApprovalMode] = useState<"APPROVE" | "REJECT" | null>(
    null,
  );
  const [editProjectId, setEditProjectId] = useState(
    transaction.projectId ?? "",
  );
  const [editPurpose, setEditPurpose] = useState(transaction.purpose ?? "");
  const [editNote, setEditNote] = useState(transaction.note ?? "");
  const [editType, setEditType] = useState<TransactionType>(transaction.type);
  const [editScope, setEditScope] = useState<
    "internal" | "service" | "project"
  >(
    transaction.internalRequest
      ? "internal"
      : transaction.projectRequest
        ? "project"
        : "service",
  );
  const [editItems, setEditItems] = useState<EditableRequestItem[]>(() =>
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
  const [lastInventoryHref, setLastInventoryHref] =
    useState("/dashboard/server");
  const [resolutions, setResolutions] = useState<ResolutionState>(() =>
    buildReturnBatchRevision(transaction.items, transaction.outcomes, ""),
  );
  const [quantityErrors, setQuantityErrors] = useState<Record<string, string>>(
    {},
  );
  const [editQuantityErrors, setEditQuantityErrors] = useState<
    Record<string, string>
  >({});
  const [deletingOutcomeId, setDeletingOutcomeId] = useState<string | null>(
    null,
  );
  const [resolutionBatchId, setResolutionBatchId] = useState("");
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(
    null,
  );
  const [confirmingSerialId, setConfirmingSerialId] = useState<string | null>(
    null,
  );
  const [serialOptions, setSerialOptions] = useState<
    Record<string, { id: string; serialNo: string; stockCode: string | null }[]>
  >({});
  const [selectedSerials, setSelectedSerials] = useState<
    Record<string, string>
  >({});

  async function loadSerialOptions(item: TransactionReturnItem) {
    if (!item.canConfirmSerial) return;
    try {
      const response = await fetch(
        `/api/transactions/${transaction.id}/items/${item.itemId}/swap`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Unable to load serial numbers.");
      setSerialOptions((current) => ({
        ...current,
        [item.itemId]: data.assets,
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load serial numbers.",
      );
    }
  }

  async function confirmIssueSerial(item: TransactionReturnItem) {
    if (!item.canConfirmSerial || confirmingSerialId) return;
    setConfirmingSerialId(item.itemId);
    setError(null);
    try {
      const response = await fetch(
        `/api/transactions/${transaction.id}/items/${item.itemId}/swap`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            replacementAssetId: selectedSerials[item.itemId] ?? item.assetId,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Unable to confirm serial number.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to confirm serial number.",
      );
    } finally {
      setConfirmingSerialId(null);
    }
  }

  async function cancelReturnBatch(batchId: string) {
    const batch = transaction.editableReturnBatches.find(
      (candidate) => candidate.id === batchId,
    );
    if (!batch || cancellingBatchId || isSubmitting) return;
    if (!window.confirm(`Cancel return round ${batch.requestNo}?`)) return;
    setCancellingBatchId(batchId);
    setError(null);
    try {
      const response = await fetch(
        `/api/transactions/${encodeURIComponent(transaction.id)}/return-batches/${encodeURIComponent(batchId)}/cancel`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.message ?? "Unable to cancel return round.");
      if (resolutionBatchId === batchId) selectReturnBatch("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to cancel return round.",
      );
    } finally {
      setCancellingBatchId(null);
    }
  }

  function selectReturnBatch(batchId: string) {
    if (
      batchId &&
      !transaction.editableReturnBatches.some((batch) => batch.id === batchId)
    )
      return;
    const next = buildReturnBatchRevision(
      transaction.items,
      transaction.outcomes,
      batchId,
    );
    setResolutionBatchId(batchId);
    setResolutions(next);
    setQuantityErrors({});
    setError(null);
  }

  const openItems = useMemo(
    () =>
      transaction.items.filter((item) =>
        hasOpenReturnQuantity(
          transaction.workflowStatus,
          availableReturnQuantity(
            item,
            transaction.outcomes,
            resolutionBatchId,
          ),
        ),
      ),
    [
      transaction.workflowStatus,
      transaction.items,
      transaction.outcomes,
      resolutionBatchId,
    ],
  );
  const openQuantity = useMemo(
    () =>
      openItems.reduce(
        (sum, item) =>
          sum +
          availableReturnQuantity(
            item,
            transaction.outcomes,
            resolutionBatchId,
          ),
        0,
      ),
    [openItems, transaction.outcomes, resolutionBatchId],
  );
  const soldSummary = useMemo(() => {
    const rows = openItems.flatMap((item) => {
      const state = resolutions[item.itemId];
      return state?.selected
        ? state.allocations
            .filter(
              (allocation) =>
                allocation.toStatus === "SOLD" && allocation.soldPrice.trim(),
            )
            .map((allocation) => ({
              quantity: allocation.quantity,
              price: Number(allocation.soldPrice) || 0,
            }))
        : [];
    });
    return {
      total: rows.reduce((sum, row) => sum + row.quantity * row.price, 0),
      count: rows.length,
    };
  }, [openItems, resolutions]);
  const [priceGroups, setPriceGroups] = useState<
    Record<string, SalePriceGroup[]>
  >(() =>
    Object.fromEntries(
      transaction.items.map((item) => [
        item.itemId,
        item.salePriceGroups?.length
          ? item.salePriceGroups
          : [
              {
                quantity: item.requestedQuantity,
                unitPrice: item.soldPrice ?? "",
                total: item.soldTotal ?? "",
              },
            ],
      ]),
    ),
  );
  const salePricing = useMemo(() => {
    let error: string | null = null;
    const groups = Object.fromEntries(
      Object.entries(priceGroups).map(([itemId, entries]) => [
        itemId,
        entries.map((group) => {
          try {
            return {
              ...group,
              total: calculateSaleGroupTotal(group.quantity, group.unitPrice),
            };
          } catch (cause) {
            error =
              cause instanceof Error ? cause.message : "Invalid sale price.";
            return { ...group, total: "" };
          }
        }),
      ]),
    );
    let grandTotal = "";
    if (!error) {
      try {
        grandTotal = calculateSaleGrandTotal(Object.values(groups).flat());
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Invalid sale total.";
      }
    }
    return { groups, grandTotal, error };
  }, [priceGroups]);
  const [savingPriceDraft, setSavingPriceDraft] = useState(false);
  const [priceDraftSaved, setPriceDraftSaved] = useState(false);

  async function savePriceDraft() {
    if (savingPriceDraft || !transaction.requiresSoldPriceApproval) return;
    if (salePricing.error) {
      setError(salePricing.error);
      return;
    }
    setSavingPriceDraft(true);
    setError(null);
    setPriceDraftSaved(false);
    try {
      const response = await fetch(
        `/api/transactions/${transaction.id}/sale-price-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceGroups: salePricing.groups,
            soldPrice: salePricing.grandTotal,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Unable to save price draft.");
      setPriceDraftSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save price draft.",
      );
    } finally {
      setSavingPriceDraft(false);
    }
  }
  const projectOptions = projects.map((project) => ({
    label: formatProjectLabel(project),
    searchText: [project.customerName, project.name, project.projectId]
      .filter(Boolean)
      .join(" "),
    value: project.id,
  }));

  async function handleExport() {
    setIsExporting(true);
    setError(null);
    try {
      await downloadTransactionPdf(transaction.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to export PDF.",
      );
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
    return availableReturnQuantity(
      item,
      transaction.outcomes,
      resolutionBatchId,
    );
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
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? "Unable to remove pending outcome.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to remove pending outcome.",
      );
    } finally {
      setDeletingOutcomeId(null);
    }
  }

  function allocationMaximum(item: TransactionReturnItem, index: number) {
    const allocations = resolutions[item.itemId]?.allocations ?? [
      {
        quantity: item.requestedQuantity,
        toStatus: "READY" as AssetStatus,
        note: "",
        soldPrice: "",
      },
    ];
    const otherQuantity = allocations.reduce(
      (sum, allocation, allocationIndex) =>
        allocationIndex === index ? sum : sum + allocation.quantity,
      0,
    );
    return Math.max(1, resolutionMaximum(item) - otherQuantity);
  }

  function quantityMismatch(item: TransactionReturnItem) {
    if (!item.isQuantityAsset) return null;
    const expected = resolutionMaximum(item);
    const total =
      resolutions[item.itemId]?.allocations.reduce(
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
    if (
      (editScope === "project" && !editProjectId) ||
      (editScope !== "project" && !editPurpose.trim())
    ) {
      setError(
        editScope === "project"
          ? "Project is required."
          : "Customer Name is required.",
      );
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
          purpose:
            editScope === "project"
              ? (projects.find((project) => project.id === editProjectId)
                  ?.name ?? "Project")
              : editPurpose.trim(),
          serviceRequest: editScope === "service",
          type: editType,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to update request.");
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to update request.",
      );
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
          ? {
              ...item,
              quantity: item.isQuantityAsset
                ? Math.min(item.availableQuantity, Math.max(1, quantity))
                : 1,
            }
          : item,
      ),
    );
  }

  function addResolutionSplit(itemId: string, maximum: number) {
    setResolutions((current) => {
      const state = current[itemId];
      if (!state || maximum <= 1 || state.allocations.length >= 10)
        return current;
      const used = state.allocations.reduce(
        (sum, allocation) => sum + allocation.quantity,
        0,
      );
      const remaining = maximum - used;
      if (remaining <= 0) return current;
      return {
        ...current,
        [itemId]: {
          ...state,
          allocations: [
            ...state.allocations,
            {
              quantity: remaining,
              toStatus: AssetStatus.READY,
              returnCondition: "NEW",
              note: "",
              soldPrice: "",
            },
          ],
        },
      };
    });
  }

  function updateResolutionAllocation(
    itemId: string,
    index: number,
    patch: Partial<{
      quantity: number;
      toStatus: AssetStatus;
      returnCondition: "NEW" | "USED" | null;
      note: string;
      soldPrice: string;
    }>,
  ) {
    setResolutions((current) => {
      const state = current[itemId];
      if (!state) return current;
      const allocations = state.allocations.map(
        (allocation, allocationIndex) =>
          allocationIndex === index ? { ...allocation, ...patch } : allocation,
      );
      return {
        ...current,
        [itemId]: {
          ...state,
          allocations,
          quantity: allocations[0]?.quantity ?? 1,
          toStatus: allocations[0]?.toStatus ?? "READY",
        },
      };
    });
  }

  function removeResolutionSplit(itemId: string, index: number) {
    setResolutions((current) => {
      const state = current[itemId];
      if (!state) return current;
      return { ...current, [itemId]: removeResolutionAllocation(state, index) };
    });
    setQuantityErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith(`${itemId}-`),
        ),
      ),
    );
  }

  function toggleResolutionItem(itemId: string) {
    setResolutions((current) => {
      const state = current[itemId];
      return state
        ? { ...current, [itemId]: { ...state, selected: !state.selected } }
        : current;
    });
  }

  function updateResolutionQuantity(
    itemId: string,
    index: number,
    value: number,
    maximum: number,
  ) {
    const exceeds = value > maximum;
    setQuantityErrors((current) => {
      const next = { ...current };
      const key = `${itemId}-${index}`;
      if (exceeds) next[key] = `Cannot exceed available stock (${maximum})`;
      else delete next[key];
      return next;
    });
    updateResolutionAllocation(itemId, index, {
      quantity: Math.min(maximum, Math.max(1, value || 1)),
    });
  }

  function openApproval(mode: "APPROVE" | "REJECT") {
    setError(null);
    setRejectReason("");

    if (
      !canOpenReturnApproval(
        transaction.canApprove,
        transaction.approvalTag,
        mode,
      )
    ) {
      setError(
        transaction.rejectBlockedReason ??
          "No approval is waiting for this user.",
      );
      return;
    }

    setApprovalMode(mode);
  }

  async function confirmApproval() {
    if (
      !canOpenReturnApproval(
        transaction.canApprove,
        transaction.approvalTag,
        approvalMode ?? "APPROVE",
      )
    )
      return;
    if (
      approvalMode === "APPROVE" &&
      !transaction.isAcknowledgement &&
      !transaction.hasSignature
    ) {
      router.push("/dashboard/settings");
      return;
    }

    if (approvalMode === "APPROVE" && transaction.requiresSoldPriceApproval) {
      const missingPrice = transaction.items.some((item) => {
        try {
          validateSalePriceGroups(
            salePricing.groups[item.itemId] ?? [],
            item.requestedQuantity,
            !item.isQuantityAsset,
            false,
          );
          return false;
        } catch {
          return true;
        }
      });
      if (missingPrice || salePricing.error) {
        setError(
          salePricing.error ??
            "Enter Price / unit and allocate QTY for every sold item.",
        );
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
      const response = await fetch(
        `/api/transactions/${transaction.id}/${endpoint}`,
        {
          body: JSON.stringify(
            approvalMode === "REJECT"
              ? { reason: rejectReason.trim() }
              : {
                  comment: null,
                  priceGroups: transaction.requiresSoldPriceApproval
                    ? salePricing.groups
                    : undefined,
                  soldPrice: transaction.requiresSoldPriceApproval
                    ? salePricing.grandTotal
                    : null,
                },
          ),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to update approval.");
      }

      setApprovalMode(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to update approval.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }
  function handleSubmit() {
    if (!transaction.canReturn) {
      setError(
        transaction.returnBlockedReason ??
          "This transaction cannot be returned.",
      );
      return;
    }

    const selectedItems = openItems.filter(
      (item) => resolutions[item.itemId]?.selected,
    );
    if (selectedItems.length === 0) {
      setError("This transaction has no open items.");
      return;
    }

    for (const item of selectedItems) {
      if (!item.isQuantityAsset) continue;
      const returnMaximum = resolutionMaximum(item);
      const total =
        resolutions[item.itemId]?.allocations.reduce(
          (sum, allocation) => sum + allocation.quantity,
          0,
        ) ?? 0;
      if (total <= 0 || total > returnMaximum) {
        setError(
          quantityMismatch(item) ??
            `${item.model}: Select a valid return quantity.`,
        );
        return;
      }
    }

    setError(null);
    setConfirmationMode(
      selectedItems.some((item) =>
        resolutions[item.itemId]?.allocations.some(
          (allocation) => allocation.toStatus === "SOLD",
        ),
      )
        ? "SOLD"
        : "RETURN",
    );
  }

  async function confirmSubmit() {
    if (
      cancellingBatchId ||
      !transaction.canReturn ||
      (resolutionBatchId &&
        !transaction.editableReturnBatches.some(
          (batch) => batch.id === resolutionBatchId,
        ))
    )
      return;
    const items = openItems
      .filter((item) => resolutions[item.itemId]?.selected)
      .map((item) => {
        const toStatus = resolutions[item.itemId]?.toStatus ?? "READY";

        return {
          itemId: item.itemId,
          allocations: (
            resolutions[item.itemId]?.allocations ?? [
              {
                quantity: item.requestedQuantity,
                toStatus,
                returnCondition: "NEW",
                note: "",
                soldPrice: "",
              },
            ]
          ).map((allocation) => ({
            ...allocation,
            returnCondition:
              allocation.toStatus === AssetStatus.READY
                ? (allocation.returnCondition ?? "NEW")
                : undefined,
          })),
          soldPrice: null,
          toStatus,
        };
      });

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/transactions/${transaction.id}/return`,
        {
          body: JSON.stringify({
            items,
            resolutionBatchId: resolutionBatchId || undefined,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
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
  return {
    addItemHref,
    addResolutionSplit,
    allocationMaximum,
    approvalMode,
    cancelReturnBatch,
    cancellingBatchId,
    confirmApproval,
    confirmIssueSerial,
    confirmSubmit,
    confirmationMode,
    confirmingSerialId,
    deletePendingOutcome,
    deletingOutcomeId,
    editItems,
    editNote,
    editProjectId,
    editPurpose,
    editQuantityErrors,
    editScope,
    editType,
    error,
    handleExport,
    handleSubmit,
    isExporting,
    isSubmitting,
    loadSerialOptions,
    openApproval,
    openItems,
    openQuantity,
    priceDraftSaved,
    priceGroups,
    projectOptions,
    quantityErrors,
    quantityMismatch,
    rejectReason,
    removeEditItem,
    removeResolutionSplit,
    resolutionBatchId,
    resolutionMaximum,
    resolutions,
    salePricing,
    savePendingEdit,
    savePriceDraft,
    savingPriceDraft,
    selectReturnBatch,
    selectedSerials,
    serialOptions,
    setApprovalMode,
    setConfirmationMode,
    setEditNote,
    setEditProjectId,
    setEditPurpose,
    setEditScope,
    setEditType,
    setError,
    setPriceDraftSaved,
    setPriceGroups,
    setRejectReason,
    setSelectedSerials,
    soldSummary,
    toggleResolutionItem,
    updateEditItemQuantity,
    updateResolutionAllocation,
    updateResolutionQuantity,
  };
}
export type ReturnTransactionController = ReturnType<
  typeof useReturnTransaction
>;
