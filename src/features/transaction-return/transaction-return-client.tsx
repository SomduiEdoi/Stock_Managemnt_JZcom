"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { AssetStatus, TransactionType, TransactionWorkflowStatus } from "@prisma/client";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

export type TransactionReturnItem = {
  assetId: string;
  brand: string | null;
  currentStep: string;
  currentStatus: AssetStatus;
  isQuantityAsset: boolean;
  itemId: string;
  kindLabel: string;
  model: string;
  note: string | null;
  requestedQuantity: number;
  resolvedAt: string | null;
  resolvedStatus: AssetStatus | null;
  resolutionNote: string | null;
  serialNo: string | null;
  stockCode: string | null;
};

type EditableRequestItem = {
  assetId: string;
  isQuantityAsset: boolean;
  model: string;
  quantity: number;
  serialNo: string | null;
  stockCode: string | null;
};

export type TransactionReturnRecord = {
  approvalStep: number | null;
  approvalTag: string | null;
  canApprove: boolean;
  canEditPendingRequest: boolean;
  canReturn: boolean;
  returnBlockedReason: string | null;
  id: string;
  internalRequest: boolean;
  items: TransactionReturnItem[];
  kindLabel: string;
  note: string | null;
  projectRequest: boolean;
  purpose: string | null;
  rejectBlockedReason: string | null;
  requestedBy: string;
  requiresSoldPriceApproval: boolean;
  serviceRequest: boolean;
  transactionNo: string;
  type: TransactionType;
  workflowStatus: TransactionWorkflowStatus;
};

type ResolutionState = Record<
  string,
  {
    toStatus: AssetStatus;
  }
>;

const resolutionOptions = [
  "READY",
  "SOLD",
] as const satisfies readonly AssetStatus[];

const resolutionOptionLabels = {
  READY: "Return",
  SOLD: "Sold",
} as const satisfies Record<(typeof resolutionOptions)[number], string>;

function buildInitialState(items: TransactionReturnItem[]): ResolutionState {
  return Object.fromEntries(
    items
      .filter((item) => !item.resolvedAt)
      .map((item) => [
        item.itemId,
        {
          toStatus: "READY" as AssetStatus,
        },
      ]),
  );
}

function fallback(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

export function TransactionReturnClient({
  transaction,
}: {
  transaction: TransactionReturnRecord;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmationMode, setConfirmationMode] = useState<
    "RETURN" | "SOLD" | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [price, setPrice] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [remark, setRemark] = useState("");
  const [approvalMode, setApprovalMode] = useState<"APPROVE" | "REJECT" | null>(null);
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
        serialNo: item.serialNo,
        stockCode: item.stockCode,
      })),
  );
  const [newAssetId, setNewAssetId] = useState("");
  const [newAssetQuantity, setNewAssetQuantity] = useState(1);
  const [resolutions, setResolutions] = useState<ResolutionState>(() =>
    buildInitialState(transaction.items),
  );

  const openItems = useMemo(
    () => transaction.items.filter((item) => !item.resolvedAt),
    [transaction.items],
  );

  async function savePendingEdit() {
    if (!editPurpose.trim()) {
      setError("Use detail is required.");
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
          projectRequest: editScope === "project",
          purpose: editPurpose.trim(),
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
    setEditItems((items) =>
      items.map((item) =>
        item.assetId === assetId
          ? { ...item, quantity: item.isQuantityAsset ? Math.max(1, quantity) : 1 }
          : item,
      ),
    );
  }

  function addEditItem() {
    const assetId = newAssetId.trim();

    if (!assetId) {
      setError("Asset ID is required before adding an item.");
      return;
    }

    if (editItems.some((item) => item.assetId === assetId)) {
      setError("This asset is already in the request.");
      return;
    }

    setEditItems((items) => [
      ...items,
      {
        assetId,
        isQuantityAsset: true,
        model: "New asset",
        quantity: Math.max(1, newAssetQuantity),
        serialNo: null,
        stockCode: null,
      },
    ]);
    setNewAssetId("");
    setNewAssetQuantity(1);
    setError(null);
  }
  function updateResolution(itemId: string, value: string) {
    setResolutions((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        toStatus: value as AssetStatus,
      },
    }));
  }

  function openApproval(mode: "APPROVE" | "REJECT") {
    setError(null);
    setPrice("");
    setRejectReason("");

    if (!transaction.canApprove) {
      setError(transaction.rejectBlockedReason ?? "No approval is waiting for this user.");
      return;
    }

    setApprovalMode(mode);
  }

  async function confirmApproval() {
    if (approvalMode === "APPROVE" && transaction.requiresSoldPriceApproval && !price.trim()) {
      setError("Price is required before approval.");
      return;
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
                soldPrice: transaction.requiresSoldPriceApproval ? price.trim() : null,
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

    if (openItems.length === 0) {
      setError("This transaction has no open items.");
      return;
    }

    setError(null);
    setPrice("");
    setRemark("");
    setConfirmationMode(
      openItems.some((item) => resolutions[item.itemId]?.toStatus === "SOLD")
        ? "SOLD"
        : "RETURN",
    );
  }

  async function confirmSubmit() {
    const cleanRemark = remark.trim();
    const items = openItems.map((item) => {
      const toStatus = resolutions[item.itemId]?.toStatus ?? "READY";

      return {
        itemId: item.itemId,
        note: cleanRemark || null,
        soldPrice: null,
        toStatus,
      };
    });

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/transactions/${transaction.id}/return`, {
        body: JSON.stringify({ items }),
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
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm font-bold"
          >
            <Link className="text-[#2563EB] transition hover:text-brand-accent" href="/logs">
              Logs
            </Link>
            <span className="text-muted-foreground">&gt;</span>
            <Link
              className="text-[#2563EB] transition hover:text-brand-accent"
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
      </header>

      {transaction.canEditPendingRequest ? (
        <section className="rounded-md border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[180px_minmax(0,1fr)_180px]">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase text-ink">Transaction Type</span>
              <select
                className="h-11 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy outline-none ring-brand-accent/20 focus:ring-4"
                onChange={(event) => {
                  const nextType = event.target.value as TransactionType;
                  setEditType(nextType);
                  if (nextType === "USING") {
                    setEditScope("internal");
                  } else if (editScope === "internal") {
                    setEditScope("service");
                  }
                }}
                value={editType}
              >
                <option value="BORROW">Borrow</option>
                <option value="USING">Using</option>
                <option value="SOLD">Sold</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase text-ink">Use Detail</span>
              <input
                className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4"
                onChange={(event) => setEditPurpose(event.target.value)}
                value={editPurpose}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase text-ink">Scope</span>
              <select
                className="h-11 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy outline-none ring-brand-accent/20 focus:ring-4"
                disabled={editType === "USING"}
                onChange={(event) => setEditScope(event.target.value as "internal" | "service" | "project")}
                value={editType === "USING" ? "internal" : editScope}
              >
                {editType === "USING" ? <option value="internal">Internal</option> : null}
                {editType !== "USING" ? <option value="service">Service</option> : null}
                {editType !== "USING" ? <option value="project">Project</option> : null}
              </select>
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
            <div className="flex flex-col gap-3 border-b border-border bg-surface px-4 py-3 lg:flex-row lg:items-end">
              <label className="flex flex-1 flex-col gap-2">
                <span className="text-xs font-bold uppercase text-ink">Add Asset ID</span>
                <input
                  className="h-10 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4"
                  onChange={(event) => setNewAssetId(event.target.value)}
                  placeholder="Paste asset id"
                  value={newAssetId}
                />
              </label>
              <label className="flex w-32 flex-col gap-2">
                <span className="text-xs font-bold uppercase text-ink">Qty</span>
                <input
                  className="h-10 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4"
                  min={1}
                  onChange={(event) => setNewAssetQuantity(Number(event.target.value) || 1)}
                  type="number"
                  value={newAssetQuantity}
                />
              </label>
              <button
                className="h-10 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-black"
                onClick={addEditItem}
                type="button"
              >
                Add Item
              </button>
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
                          min={1}
                          onChange={(event) =>
                            updateEditItemQuantity(item.assetId, Number(event.target.value) || 1)
                          }
                          type="number"
                          value={item.isQuantityAsset ? item.quantity : 1}
                        />
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

      {transaction.canApprove ? (
        <section className="flex flex-col gap-3 rounded-md border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">Approval Detail</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Review this request before approving or rejecting it.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-status-fail bg-white px-4 text-sm font-bold text-status-fail hover:bg-status-fail/10"
              onClick={() => openApproval("REJECT")}
              type="button"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-bold text-white hover:bg-brand-accent/90"
              onClick={() => openApproval("APPROVE")}
              type="button"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve
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

      <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy">Request Items</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {transaction.canReturn
                ? "Select the final outcome for each open asset."
                : "Review the approval step and requested assets."}
            </p>
          </div>
          <span className="text-sm font-bold text-navy">
            {openItems.length} open / {transaction.items.length} total
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-[22%] px-5 py-4 font-bold">Asset</th>
                <th className="w-[12%] px-5 py-4 font-bold">Brand</th>
                <th className="w-[13%] px-5 py-4 font-bold">Stock Code</th>
                <th className="w-[15%] px-5 py-4 font-bold">Serial No.</th>
                <th className="w-[14%] px-5 py-4 font-bold">Type</th>
                <th className="w-[16%] px-5 py-4 font-bold">Current Step</th>
                <th className="w-[14%] px-5 py-4 font-bold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transaction.items.map((item) => {
                const isResolved = Boolean(item.resolvedAt);
                const state = resolutions[item.itemId];

                return (
                  <tr className="align-middle" key={item.itemId}>
                    <td className="px-5 py-4">
                      <Link
                        className="block truncate font-bold text-navy hover:text-brand-accent"
                        href={`/dashboard/assets/${item.assetId}`}
                        title={item.model}
                      >
                        {item.model}
                      </Link>
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.brand)}>
                      {fallback(item.brand)}
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.stockCode)}>
                      {fallback(item.stockCode)}
                    </td>
                    <td className="truncate px-5 py-4 font-medium text-ink" title={fallback(item.serialNo)}>
                      {fallback(item.serialNo)}
                    </td>
                    <td className="truncate px-5 py-4 font-bold text-navy" title={item.kindLabel}>
                      {item.kindLabel}
                    </td>
                    <td className="truncate px-5 py-4 font-semibold text-ink" title={item.currentStep}>
                      {item.currentStep}
                    </td>
                    <td className="px-5 py-4">
                      {isResolved && item.resolvedStatus ? (
                        <AssetStatusBadge status={item.resolvedStatus} />
                      ) : transaction.canReturn ? (
                        <select
                          className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-bold text-navy outline-none ring-brand-accent/20 focus:ring-4"
                          onChange={(event) =>
                            updateResolution(item.itemId, event.target.value)
                          }
                          value={state?.toStatus ?? "READY"}
                        >
                          {resolutionOptions.map((status) => (
                            <option key={status} value={status}>
                              {resolutionOptionLabels[status]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">
                          Awaiting approval
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

      {error ? (
        <p className="flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-5 text-sm font-bold text-navy hover:bg-surface"
          href="/logs"
        >
          Cancel
        </Link>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-5 text-sm font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || openItems.length === 0 || !transaction.canReturn}
          onClick={handleSubmit}
          type="button"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Save Outcomes
        </button>
      </div>

      {approvalMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section className="w-full max-w-md rounded-md border border-border bg-white p-5 shadow-xl">
            <h2 className="text-xl font-bold text-navy">
              {approvalMode === "APPROVE" ? "Approve Request" : "Reject Request"}
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {approvalMode === "APPROVE"
                ? "Confirm that you approve this request."
                : "Please provide a reject reason. The requested assets will be released."}
            </p>

            {error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-4">
              {approvalMode === "APPROVE" && transaction.requiresSoldPriceApproval ? (
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase text-ink">Price</span>
                  <input
                    className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4"
                    inputMode="decimal"
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="Enter sale price"
                    value={price}
                  />
                </label>
              ) : null}

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
                Confirm
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
                : "Confirm that these assets have been returned."}
            </p>

            {error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase text-ink">
                  Remark
                </span>
                <textarea
                  className="min-h-28 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-ink outline-none ring-brand-accent/20 focus:ring-4"
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder="Optional remark"
                  value={remark}
                />
              </label>
            </div>

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



