"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileDown,
  Loader2,
  XCircle,
} from "lucide-react";
import { type TransactionType } from "@prisma/client";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";

import {
  formatReturnDate,
  fallback,
  missingSignatureMessage,
} from "./return-transaction-state";
import type {
  TransactionProjectOption,
  TransactionReturnRecord,
} from "./return-transaction-state";
import { useReturnTransaction } from "./useReturnTransaction";
import { ReturnItemsTable } from "./ReturnItemsTable";
import { ReturnSummaryPanel } from "./ReturnSummaryPanel";
import { TransactionSummaryPanel } from "./TransactionSummaryPanel";
export {
  removeResolutionAllocation,
  canOpenReturnApproval,
  hasOpenReturnQuantity,
  getReturnResolutionOptions,
  classifyReturnOutcome,
  buildReturnBatchRevision,
  formatReturnDate,
} from "./return-transaction-state";
export type {
  TransactionReturnItem,
  TransactionOutcomeSummary,
  TransactionReturnRecord,
} from "./return-transaction-state";

export function TransactionReturnClient({
  canExportAnytime,
  projects,
  transaction,
}: {
  canExportAnytime: boolean;
  projects: TransactionProjectOption[];
  transaction: TransactionReturnRecord;
}) {
  const view = useReturnTransaction({ projects, transaction });
  const {
    openApproval,
    isExporting,
    handleExport,
    setEditType,
    setEditScope,
    editScope,
    editType,
    setEditProjectId,
    projectOptions,
    editProjectId,
    setEditPurpose,
    editPurpose,
    setEditNote,
    editNote,
    addItemHref,
    editItems,
    updateEditItemQuantity,
    editQuantityErrors,
    removeEditItem,
    isSubmitting,
    savePendingEdit,
    cancellingBatchId,
    resolutionBatchId,
    selectReturnBatch,
    cancelReturnBatch,
    soldSummary,
    salePricing,
    priceDraftSaved,
    savePriceDraft,
    savingPriceDraft,
    error,
    openItems,
    resolutions,
    quantityErrors,
    quantityMismatch,
    handleSubmit,
    approvalMode,
    setRejectReason,
    rejectReason,
    setApprovalMode,
    confirmApproval,
    confirmationMode,
    setConfirmationMode,
    confirmSubmit,
  } = view;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm font-bold"
          >
            <Link
              className="text-navy transition hover:text-brand-accent"
              href="/logs"
            >
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
                {!transaction.approvalTag?.startsWith("RETURN_CHECK:") ? (
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-bold text-white hover:bg-brand-accent/90"
                    onClick={() => openApproval("APPROVE")}
                    type="button"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </button>
                ) : null}
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

      <TransactionSummaryPanel transaction={transaction} />

      {transaction.workflowStatus === "REJECTED" && transaction.rejectReason ? (
        <section className="rounded-md border border-status-fail bg-status-fail/10 p-4 shadow-sm">
          <h2 className="text-lg font-bold text-status-fail">
            Request Rejected
          </h2>
          <p className="mt-2 text-sm font-semibold text-ink">
            {transaction.rejectReason}
          </p>
          <p className="mt-2 text-xs font-bold uppercase text-muted-foreground">
            {transaction.rejectedBy
              ? `Rejected by ${transaction.rejectedBy}`
              : "Rejected"}
            {transaction.rejectedAt
              ? ` on ${formatReturnDate(transaction.rejectedAt)}`
              : ""}
          </p>
        </section>
      ) : null}

      {transaction.canEditPendingRequest ? (
        <section className="rounded-md border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[180px_minmax(0,1fr)_180px]">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase text-ink">
                Transaction Type
              </span>
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
                {editType === "USING"
                  ? "Internal"
                  : editScope === "project"
                    ? "Project"
                    : "Customer Name"}
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
              <span className="text-xs font-bold uppercase text-ink">
                Scope
              </span>
              <SearchableDropdown
                disabled={editType === "USING"}
                onChange={(value) => {
                  const nextScope = value as "internal" | "service" | "project";
                  setEditScope(nextScope);
                  if (nextScope !== "project") setEditProjectId("");
                  if (nextScope === "project" || nextScope === "internal")
                    setEditPurpose("");
                }}
                options={
                  editType === "USING"
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
                      <td
                        className="truncate px-4 py-3 font-bold text-navy"
                        title={item.model}
                      >
                        {item.model}
                      </td>
                      <td
                        className="truncate px-4 py-3 font-medium text-ink"
                        title={fallback(item.stockCode)}
                      >
                        {fallback(item.stockCode)}
                      </td>
                      <td
                        className="truncate px-4 py-3 font-medium text-ink"
                        title={fallback(item.serialNo)}
                      >
                        {fallback(item.serialNo)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="h-9 w-20 rounded-md border border-border bg-white px-2 text-sm font-bold text-navy outline-none ring-brand-accent/20 focus:ring-4 disabled:bg-surface"
                          disabled={!item.isQuantityAsset}
                          max={item.availableQuantity}
                          min={1}
                          onChange={(event) =>
                            updateEditItemQuantity(
                              item.assetId,
                              Number(event.target.value) || 1,
                            )
                          }
                          type="number"
                          value={item.isQuantityAsset ? item.quantity : 1}
                        />
                        {item.isQuantityAsset &&
                        editQuantityErrors[item.assetId] ? (
                          <p className="mt-1 text-xs font-semibold text-status-fail">
                            {editQuantityErrors[item.assetId]}
                          </p>
                        ) : null}
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
                      <td
                        className="px-4 py-6 text-center text-sm font-semibold text-muted-foreground"
                        colSpan={5}
                      >
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
        <p
          role="alert"
          className="flex items-start gap-2 text-sm font-semibold text-status-fail"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {transaction.approvalBlockedReason}
        </p>
      )}

      {transaction.sourceTransactionId && (
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-accent hover:underline"
          href={`/logs/${encodeURIComponent(transaction.sourceTransactionId)}/return`}
        >
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
              {transaction.editableReturnBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.requestNo} / {batch.phase}
                </option>
              ))}
            </select>
          </label>
          {resolutionBatchId && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-status-fail px-3 text-sm font-semibold text-status-fail disabled:opacity-50"
              disabled={isSubmitting || cancellingBatchId !== null}
              onClick={() => void cancelReturnBatch(resolutionBatchId)}
            >
              {cancellingBatchId ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle aria-hidden="true" className="h-4 w-4" />
              )}
              Cancel Round
            </button>
          )}
        </div>
      )}

      <ReturnItemsTable view={view} transaction={transaction} />

      {transaction.outcomes.length > 0 ? (
        <ReturnSummaryPanel view={view} transaction={transaction} />
      ) : null}

      {soldSummary.count > 0 ? (
        <div className="flex justify-end rounded-md border border-brand-accent/30 bg-brand-accent/5 px-5 py-4 text-right">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Grand Total
            </p>
            <p className="text-xl font-bold text-navy">
              {soldSummary.total.toFixed(2)}
            </p>
          </div>
        </div>
      ) : null}

      {transaction.requiresSoldPriceApproval ? (
        <div className="flex justify-end rounded-md border border-brand-accent/30 bg-brand-accent/5 px-5 py-4 text-right">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Grand Total
            </p>
            <input
              aria-label="Grand Total"
              className="mt-2 h-10 rounded-md border border-border bg-surface/50 px-3 text-right font-bold tabular-nums text-navy"
              type="text"
              inputMode="decimal"
              readOnly
              value={salePricing.grandTotal}
            />
            {salePricing.error ? (
              <p
                className="mt-2 text-sm font-semibold text-status-fail"
                role="alert"
              >
                {salePricing.error}
              </p>
            ) : null}
            <div className="mt-3 flex items-center justify-end gap-3">
              {priceDraftSaved ? (
                <span className="text-sm text-green-700" role="status">
                  Draft saved
                </span>
              ) : null}
              <button
                type="button"
                onClick={savePriceDraft}
                disabled={
                  savingPriceDraft || isSubmitting || Boolean(salePricing.error)
                }
                className="h-10 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy disabled:opacity-50"
              >
                {savingPriceDraft ? "Saving..." : "Save Price Draft"}
              </button>
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
            disabled={
              isSubmitting ||
              cancellingBatchId !== null ||
              openItems.every((item) => !resolutions[item.itemId]?.selected) ||
              !transaction.canReturn ||
              Object.keys(quantityErrors).length > 0 ||
              openItems.some(
                (item) =>
                  resolutions[item.itemId]?.selected &&
                  Boolean(quantityMismatch(item)),
              )
            }
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
              {approvalMode === "APPROVE"
                ? transaction.isAcknowledgement
                  ? "Acknowledge Request"
                  : "Approve Request"
                : "Reject Request"}
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {approvalMode === "APPROVE"
                ? transaction.isAcknowledgement
                  ? "Confirm that you acknowledge this request."
                  : "Confirm that you approve this request."
                : "Please provide a reject reason. The requested assets will be released."}
            </p>

            {error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}

            {approvalMode === "APPROVE" &&
            !transaction.isAcknowledgement &&
            !transaction.hasSignature &&
            !error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {missingSignatureMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-4">
              {approvalMode === "REJECT" ? (
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase text-ink">
                    Reject Reason
                  </span>
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
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {approvalMode === "APPROVE" &&
                !transaction.isAcknowledgement &&
                !transaction.hasSignature
                  ? "Go to Settings"
                  : "Confirm"}
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
