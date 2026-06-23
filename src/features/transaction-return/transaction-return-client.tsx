"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import type { AssetStatus } from "@prisma/client";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

export type TransactionReturnItem = {
  assetId: string;
  brand: string | null;
  currentStatus: AssetStatus;
  itemId: string;
  model: string;
  note: string | null;
  resolvedAt: string | null;
  resolvedStatus: AssetStatus | null;
  resolutionNote: string | null;
  serialNo: string;
  stockCode: string | null;
};

export type TransactionReturnRecord = {
  id: string;
  items: TransactionReturnItem[];
  requestedBy: string;
  transactionNo: string;
  type: string;
};

type ResolutionState = Record<
  string,
  {
    note: string;
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
          note: "",
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolutions, setResolutions] = useState<ResolutionState>(() =>
    buildInitialState(transaction.items),
  );

  const openItems = useMemo(
    () => transaction.items.filter((item) => !item.resolvedAt),
    [transaction.items],
  );

  function updateResolution(
    itemId: string,
    key: keyof ResolutionState[string],
    value: string,
  ) {
    setResolutions((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [key]: value,
      },
    }));
  }

  async function handleSubmit() {
    const items = openItems.map((item) => ({
      itemId: item.itemId,
      note: resolutions[item.itemId]?.note ?? null,
      toStatus: resolutions[item.itemId]?.toStatus ?? "READY",
    }));

    if (items.length === 0) {
      setError("This transaction has no open items.");
      return;
    }

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
            className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted-foreground"
          >
            <Link className="text-brand-accent hover:underline" href="/logs">
              Logs
            </Link>
            <span>/</span>
            <span className="text-navy">{transaction.transactionNo}</span>
            <span>/</span>
            <span className="text-navy">Return</span>
          </nav>
          <h1 className="mt-3 text-3xl font-bold text-navy">
            Resolve Transaction
          </h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {transaction.type} request by {transaction.requestedBy}
          </p>
        </div>
        <Link
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface"
          href="/logs"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Logs
        </Link>
      </header>

      <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy">Request Items</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Select the final outcome for each open asset.
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
                <th className="w-[26%] px-5 py-4 font-bold">Asset</th>
                <th className="w-[15%] px-5 py-4 font-bold">Brand</th>
                <th className="w-[16%] px-5 py-4 font-bold">Stock Code</th>
                <th className="w-[18%] px-5 py-4 font-bold">Serial No.</th>
                <th className="w-[13%] px-5 py-4 font-bold">Current</th>
                <th className="w-[18%] px-5 py-4 font-bold">Outcome</th>
                <th className="w-[24%] px-5 py-4 font-bold">Note</th>
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
                    <td className="truncate px-5 py-4 font-medium text-ink" title={item.serialNo}>
                      {item.serialNo}
                    </td>
                    <td className="px-5 py-4">
                      <AssetStatusBadge status={item.currentStatus} />
                    </td>
                    <td className="px-5 py-4">
                      {isResolved && item.resolvedStatus ? (
                        <AssetStatusBadge status={item.resolvedStatus} />
                      ) : (
                        <select
                          className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-bold text-navy outline-none ring-brand-accent/20 focus:ring-4"
                          onChange={(event) =>
                            updateResolution(
                              item.itemId,
                              "toStatus",
                              event.target.value,
                            )
                          }
                          value={state?.toStatus ?? "READY"}
                        >
                          {resolutionOptions.map((status) => (
                            <option key={status} value={status}>
                              {resolutionOptionLabels[status]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {isResolved ? (
                        <span className="line-clamp-2 text-sm font-medium text-muted-foreground">
                          {fallback(item.resolutionNote)}
                        </span>
                      ) : (
                        <input
                          className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-medium text-ink outline-none ring-brand-accent/20 focus:ring-4"
                          onChange={(event) =>
                            updateResolution(
                              item.itemId,
                              "note",
                              event.target.value,
                            )
                          }
                          placeholder="Optional note"
                          value={state?.note ?? ""}
                        />
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
          disabled={isSubmitting || openItems.length === 0}
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
    </div>
  );
}
