"use client";
import { formatProjectLabel } from "@/lib/project-label";
import { formatReturnDate } from "./return-transaction-state";
import type { TransactionReturnRecord } from "./return-transaction-state";

export function TransactionSummaryPanel({
  transaction,
}: {
  transaction: TransactionReturnRecord;
}) {
  return (
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
            <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
              Requisitioner
            </p>
            <div className="min-w-0 text-sm font-normal text-ink">
              <p>{transaction.requisitionerName}</p>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
              Approver
            </p>
            <p className="min-w-0 text-sm font-normal text-ink">
              {transaction.leadSupervisorName || "-"}
            </p>
          </div>
          <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
              Request Date
            </p>
            <p className="min-w-0 text-sm font-normal text-ink">
              {formatReturnDate(transaction.requestDate)}
            </p>
          </div>
        </div>
        <div className="space-y-4 lg:border-l lg:border-border lg:pl-6">
          <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
              Customer / Project
            </p>
            <p className="min-w-0 text-sm font-normal text-ink">
              {transaction.projectName
                ? formatProjectLabel({
                    name: transaction.projectName,
                    customerName: transaction.customerName,
                    projectId: transaction.projectCode,
                  })
                : transaction.customerName || "-"}
            </p>
          </div>
          <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
              Detail
            </p>
            <p
              className={
                transaction.note
                  ? "min-w-0 whitespace-pre-wrap text-sm font-normal text-ink"
                  : "min-w-0 text-sm italic text-gray-400"
              }
            >
              {transaction.note?.trim() || "-"}
            </p>
          </div>
          <div className="grid grid-cols-[minmax(150px,40%)_minmax(0,1fr)] items-start gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
              Return Date
            </p>
            <p className="min-w-0 text-sm font-normal text-ink">
              {transaction.returnDate
                ? formatReturnDate(transaction.returnDate)
                : ""}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
