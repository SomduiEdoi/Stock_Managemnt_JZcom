"use client";
import { XCircle } from "lucide-react";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import { formatReturnDate } from "./return-transaction-state";
import type { TransactionReturnRecord } from "./return-transaction-state";
import type { ReturnTransactionController } from "./useReturnTransaction";

export function ReturnSummaryPanel({
  view,
  transaction,
}: {
  view: Pick<
    ReturnTransactionController,
    "deletePendingOutcome" | "deletingOutcomeId"
  >;
  transaction: TransactionReturnRecord;
}) {
  const { deletePendingOutcome, deletingOutcomeId } = view;
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-xl font-bold text-navy">
          Returned / Outcome Summary
        </h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Approved and pending outcomes for this request.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Asset</th>
              <th className="px-5 py-3">Outcome</th>
              <th className="px-5 py-3">Qty</th>
              <th className="px-5 py-3">Return Condition</th>
              <th className="px-5 py-3">Price / Unit</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Remark</th>
              <th className="px-5 py-3">Approval</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transaction.outcomes.map((outcome) => {
              return (
                <tr key={outcome.id}>
                  <td className="px-5 py-3 font-bold text-navy">
                    {outcome.model}
                    <div className="text-xs font-medium text-muted-foreground">
                      {outcome.serialNo ?? outcome.stockCode ?? "-"}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <AssetStatusBadge status={outcome.outcomeStatus} />
                  </td>
                  <td className="px-5 py-3 font-bold">{outcome.quantity}</td>
                  <td className="px-5 py-3">
                    {outcome.returnCondition ?? "-"}
                  </td>
                  <td className="px-5 py-3">
                    {outcome.soldPrice
                      ? Number(outcome.soldPrice).toFixed(2)
                      : "-"}
                  </td>
                  <td className="px-5 py-3 font-bold">
                    {outcome.soldTotal != null
                      ? Number(outcome.soldTotal).toFixed(2)
                      : "-"}
                  </td>
                  <td className="px-5 py-3 text-xs">{outcome.note || "-"}</td>
                  <td className="px-5 py-3">
                    {outcome.approvedAt
                      ? formatReturnDate(outcome.approvedAt)
                      : "Pending approval"}
                  </td>
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
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
