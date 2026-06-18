"use client";

import { AssetStatus } from "@prisma/client";
import { CheckCircle2, Loader2, Package, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

export type RequestableInventoryRow = {
  assetModel: {
    brand: string | null;
    category: { name: string } | null;
    name: string;
    typeName: string | null;
  };
  id: string;
  locationText: string | null;
  serialNo: string;
  status: AssetStatus;
  stockCode: string | null;
};

type RequestableInventoryTableProps = {
  domainLabel: string;
  canRequest: boolean;
  rows: RequestableInventoryRow[];
};

function RequestConfirmDialog({
  asset,
  domainLabel,
  error,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  asset: RequestableInventoryRow;
  domainLabel: string;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isReady = asset.status === AssetStatus.READY;

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
          {domainLabel} / {asset.assetModel.name}
        </p>

        <div className="mt-6 grid gap-3 rounded-md border border-border bg-surface px-4 py-4 text-sm font-semibold text-ink sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Serial No.</p>
            <p className="mt-1">{asset.serialNo}</p>
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
        </div>

        {!isReady ? (
          <p className="mt-4 rounded-md bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
            Only READY assets can be requested.
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
            onClick={onConfirm}
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

export function RequestableInventoryTable({
  domainLabel,
  canRequest,
  rows,
}: RequestableInventoryTableProps) {
  const router = useRouter();
  const [activeAsset, setActiveAsset] = useState<RequestableInventoryRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestableCount = useMemo(
    () => rows.filter((asset) => asset.status === AssetStatus.READY).length,
    [rows],
  );

  function openAssetDetail(asset: RequestableInventoryRow) {
    router.push(`/dashboard/assets/${asset.id}`);
  }

  async function handleConfirm() {
    if (!activeAsset) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/requests/hold", {
        body: JSON.stringify({
          assetIds: [activeAsset.id],
          note: `Requested from ${domainLabel} inventory.`,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to request asset.");
      }

      router.refresh();
      router.push("/request");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request asset.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-navy">{domainLabel} Inventory</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Click any row to view details. Use Request to add an asset to your request list.
            </p>
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            {requestableCount.toLocaleString("en-US")} requestable
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-bold">Model</th>
                <th className="px-5 py-4 font-bold">Brand</th>
                <th className="px-5 py-4 font-bold">Category</th>
                <th className="px-5 py-4 font-bold">Type</th>
                <th className="px-5 py-4 font-bold">Stock Code</th>
                <th className="px-5 py-4 font-bold">Serial No.</th>
                <th className="px-5 py-4 font-bold">Status</th>
                {canRequest ? <th className="px-5 py-4 font-bold">Request</th> : null}
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
                  <td className="px-5 py-4 font-bold text-navy">{asset.assetModel.name}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {asset.assetModel.brand ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-ink">
                    {asset.assetModel.category?.name ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {asset.assetModel.typeName ?? "-"}
                  </td>
                  <td className="px-5 py-4 font-medium text-ink">
                    {asset.stockCode ?? "-"}
                  </td>
                  <td className="px-5 py-4 font-medium text-ink">{asset.serialNo}</td>
                  <td className="px-5 py-4">
                    <AssetStatusBadge status={asset.status} />
                  </td>
                  {canRequest ? (
                    <td className="px-5 py-4">
                      <button
                        className="inline-flex h-9 items-center justify-center rounded-md bg-brand-accent px-3 text-xs font-bold text-white transition hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:bg-muted-foreground disabled:text-white/70"
                        disabled={asset.status !== AssetStatus.READY}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (asset.status === AssetStatus.READY) {
                            setActiveAsset(asset);
                          }
                        }}
                        type="button"
                      >
                        Request
                      </button>
                    </td>
                  ) : null}
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
          domainLabel={domainLabel}
          error={error}
          isSubmitting={isSubmitting}
          onClose={() => {
            setActiveAsset(null);
            setError(null);
          }}
          onConfirm={handleConfirm}
        />
      ) : null}
    </>
  );
}
