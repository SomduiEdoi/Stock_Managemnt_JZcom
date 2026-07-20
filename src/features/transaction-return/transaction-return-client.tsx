"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { AssetStatus, TransactionWorkflowStatus } from "@prisma/client";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

export type TransactionReturnItem = {
  assetId: string;
  brand: string | null;
  currentStep: string;
  currentStatus: AssetStatus;
  itemId: string;
  kindLabel: string;
  model: string;
  note: string | null;
  resolvedAt: string | null;
  resolvedStatus: AssetStatus | null;
  resolutionNote: string | null;
  serialNo: string | null;
  stockCode: string | null;
};

export type TransactionReturnRecord = {
  canReturn: boolean;
  returnBlockedReason: string | null;
  id: string;
  items: TransactionReturnItem[];
  kindLabel: string;
  requestedBy: string;
  transactionNo: string;
  type: string;
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
  const [remark, setRemark] = useState("");
  const [resolutions, setResolutions] = useState<ResolutionState>(() =>
    buildInitialState(transaction.items),
  );

  const openItems = useMemo(
    () => transaction.items.filter((item) => !item.resolvedAt),
    [transaction.items],
  );

  function updateResolution(itemId: string, value: string) {
    setResolutions((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        toStatus: value as AssetStatus,
      },
    }));
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
    if (confirmationMode === "SOLD" && !price.trim()) {
      setError("Please enter the sale price.");
      return;
    }

    const cleanPrice = price.trim();
    const cleanRemark = remark.trim();
    const items = openItems.map((item) => {
      const toStatus = resolutions[item.itemId]?.toStatus ?? "READY";

      return {
        itemId: item.itemId,
        note: buildResolutionNote(toStatus, cleanRemark, cleanPrice),
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
            <Link className="text-brand-accent hover:text-navy" href="/logs">
              Logs
            </Link>
            <span className="text-muted-foreground">&gt;</span>
            <Link
              className="text-brand-accent hover:text-navy"
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

      {confirmationMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section className="w-full max-w-md rounded-md border border-border bg-white p-5 shadow-xl">
            <h2 className="text-xl font-bold text-navy">
              {confirmationMode === "SOLD" ? "Confirm Sale" : "Confirm Return"}
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {confirmationMode === "SOLD"
                ? "Please enter the sale price and confirm that these assets should be sold."
                : "Confirm that these assets have been returned."}
            </p>

            {error ? (
              <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-4">
              {confirmationMode === "SOLD" ? (
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase text-ink">
                    Price
                  </span>
                  <input
                    className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4"
                    inputMode="decimal"
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="Enter sale price"
                    value={price}
                  />
                </label>
              ) : null}

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

function buildResolutionNote(
  toStatus: AssetStatus,
  remark: string,
  price: string,
) {
  const parts: string[] = [];

  if (toStatus === "SOLD" && price) {
    parts.push(`Sold price: ${price}`);
  }

  if (remark) {
    parts.push(remark);
  }

  return parts.length ? parts.join("\n") : null;
}

