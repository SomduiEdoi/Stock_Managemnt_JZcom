"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileDown,
  Loader2,
  Package,
  Trash2,
  X,
} from "lucide-react";
import {
  printTransaction,
  type PrintableTransaction,
} from "@/features/transactions/transaction-print";

type TransactionTypeCode = "BORROW" | "USING" | "SOLD";

export type RequestCartAssetClient = {
  assetModel: {
    brand: string | null;
    category: { name: string } | null;
    name: string;
    typeName: string | null;
  };
  domain: { code: "SERVER" | "NETWORK"; name: string };
  id: string;
  location: { name: string } | null;
  locationText: string | null;
  requestLockedAt: string | null;
  serialNo: string;
  status: string;
  stockCode: string | null;
};

type RequestCartClientProps = {
  initialAssets: RequestCartAssetClient[];
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDomain(domainCode: string) {
  return domainCode.charAt(0) + domainCode.slice(1).toLowerCase();
}

function getReferenceLabel(type: TransactionTypeCode) {
  return type === "USING" ? "Staff Name" : "Customer Name";
}

function getReferencePlaceholder(type: TransactionTypeCode) {
  return type === "USING" ? "Enter staff name" : "Enter customer name";
}

function assetLocation(asset: RequestCartAssetClient) {
  return asset.location?.name ?? asset.locationText ?? "-";
}

function formatCurrencyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integerPart, ...fractionParts] = cleaned.split(".");

  if (fractionParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${fractionParts.join("").slice(0, 2)}`;
}

function RequestItemCard({
  asset,
  isRemoving,
  onRemove,
}: {
  asset: RequestCartAssetClient;
  isRemoving: boolean;
  onRemove: (assetId: string) => void;
}) {
  return (
    <article className="grid gap-4 rounded-md border border-border bg-white p-4 shadow-sm md:grid-cols-[56px_1fr_auto]">
      <span className="flex h-14 w-14 items-center justify-center rounded-md bg-navy text-white">
        <Package className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-navy">{asset.assetModel.name}</h3>
          <span className="rounded-full bg-brand-accent/15 px-2.5 py-1 text-[11px] font-bold uppercase text-brand-accent">
            {formatDomain(asset.domain.code)}
          </span>
        </div>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {asset.assetModel.brand ?? "-"} / SN {asset.serialNo}
        </p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          Location: {assetLocation(asset)}
        </p>
      </div>
      <button
        aria-label={`Remove ${asset.serialNo}`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-status-fail hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isRemoving}
        onClick={() => onRemove(asset.id)}
        type="button"
      >
        {isRemoving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </article>
  );
}

function EmptyRequestList() {
  return (
    <div className="rounded-md border border-dashed border-border bg-white p-8 text-center">
      <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-bold text-navy">Request list is empty</h3>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Select ready assets from inventory before submitting a request.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          className="inline-flex h-10 items-center rounded-md bg-navy px-4 text-sm font-bold text-white"
          href="/dashboard/server"
        >
          Server Inventory
        </Link>
        <Link
          className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy"
          href="/dashboard/network"
        >
          Network Inventory
        </Link>
      </div>
    </div>
  );
}

function RequestList({
  assets,
  isClearing,
  onClearAll,
  onRemove,
  removingAssetId,
}: {
  assets: RequestCartAssetClient[];
  isClearing: boolean;
  onClearAll: () => void;
  onRemove: (assetId: string) => void;
  removingAssetId: string | null;
}) {
  return (
    <section className="rounded-md border border-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Request List ({assets.length})
        </p>
        {assets.length > 0 ? (
          <button
            className="text-sm font-bold text-brand-accent hover:text-navy disabled:opacity-50"
            disabled={isClearing}
            onClick={onClearAll}
            type="button"
          >
            Clear All
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        {assets.length === 0 ? (
          <EmptyRequestList />
        ) : (
          assets.map((asset) => (
            <RequestItemCard
              asset={asset}
              isRemoving={removingAssetId === asset.id || isClearing}
              key={asset.id}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TransactionTypeSelect({
  onChange,
  value,
}: {
  onChange: (value: TransactionTypeCode) => void;
  value: TransactionTypeCode;
}) {
  return (
    <select
      className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy outline-none ring-brand-accent/20 focus:ring-4"
      onChange={(event) => onChange(event.target.value as TransactionTypeCode)}
      value={value}
    >
      <option value="BORROW">Borrow</option>
      <option value="USING">Using</option>
      <option value="SOLD">Sold</option>
    </select>
  );
}

function TransactionForm({
  assetCount,
  error,
  internalRequest,
  isSubmitting,
  note,
  onInternalRequestChange,
  onNoteChange,
  onProjectRequestChange,
  onReferenceChange,
  onRequestDateChange,
  onServiceRequestChange,
  onSoldPriceChange,
  onSubmit,
  onTypeChange,
  projectRequest,
  referenceName,
  requestDate,
  serviceRequest,
  soldPrice,
  type,
}: {
  assetCount: number;
  error: string | null;
  internalRequest: boolean;
  isSubmitting: boolean;
  note: string;
  onInternalRequestChange: (checked: boolean) => void;
  onNoteChange: (value: string) => void;
  onProjectRequestChange: (checked: boolean) => void;
  onReferenceChange: (value: string) => void;
  onRequestDateChange: (value: string) => void;
  onServiceRequestChange: (checked: boolean) => void;
  onSoldPriceChange: (value: string) => void;
  onSubmit: () => void;
  onTypeChange: (value: TransactionTypeCode) => void;
  projectRequest: boolean;
  referenceName: string;
  requestDate: string;
  serviceRequest: boolean;
  soldPrice: string;
  type: TransactionTypeCode;
}) {
  const showSoldPrice = type === "SOLD";

  return (
    <aside className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-navy">Transaction Details</h2>
        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span>
              Transaction Type <RequiredMark />
            </span>
            <TransactionTypeSelect onChange={onTypeChange} value={type} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span>
              Request Date <RequiredMark />
            </span>
            <input
              className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none ring-brand-accent/20 focus:ring-4"
              onChange={(event) => onRequestDateChange(event.target.value)}
              type="date"
              value={requestDate}
            />
          </label>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Request Kind <RequiredMark />
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  checked: internalRequest,
                  label: "Internal",
                  onChange: onInternalRequestChange,
                },
                {
                  checked: serviceRequest,
                  label: "Service",
                  onChange: onServiceRequestChange,
                },
                {
                  checked: projectRequest,
                  label: "Project",
                  onChange: onProjectRequestChange,
                },
              ].map((item) => (
                <label
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/40 px-3 py-2 text-sm font-semibold text-navy"
                  key={item.label}
                >
                  <input
                    checked={item.checked}
                    className="h-4 w-4 rounded border-border text-brand-accent focus:ring-brand-accent"
                    onChange={(event) => item.onChange(event.target.checked)}
                    type="checkbox"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span>
              {getReferenceLabel(type)} <RequiredMark />
            </span>
            <input
              className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none ring-brand-accent/20 focus:ring-4"
              onChange={(event) => onReferenceChange(event.target.value)}
              placeholder={getReferencePlaceholder(type)}
              value={referenceName}
            />
          </label>
          {showSoldPrice ? (
            <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span>
                Price <RequiredMark />
              </span>
              <input
                className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none ring-brand-accent/20 focus:ring-4"
                inputMode="decimal"
                onChange={(event) =>
                  onSoldPriceChange(formatCurrencyInput(event.target.value))
                }
                placeholder="0.00"
                value={soldPrice}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span>
              Use Detail <RequiredMark />
            </span>
            <textarea
              className="min-h-28 rounded-md border border-border bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none ring-brand-accent/20 focus:ring-4"
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Describe what these assets will be used for"
              value={note}
            />
          </label>
        </div>
        <div className="mt-5 border-t border-border pt-4 text-sm font-semibold">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Total Items Selected</span>
            <span className="text-navy">{assetCount} Assets</span>
          </div>
          <div className="mt-3 flex justify-between gap-4">
            <span className="text-muted-foreground">Request Status</span>
            <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold uppercase text-navy">
              Draft
            </span>
          </div>
        </div>
        {error ? (
          <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
        <button
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || assetCount === 0}
          onClick={onSubmit}
          type="button"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          Submit Request
        </button>
      </section>
    </aside>
  );
}

function RequiredMark() {
  return <span className="text-status-fail">*</span>;
}

function SubmitDialog({
  onClose,
  transaction,
}: {
  onClose: () => void;
  transaction: PrintableTransaction;
}) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section className="w-full max-w-md rounded-md border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-status-ready/15 text-status-ready">
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
        <h2 className="mt-5 text-2xl font-bold text-navy">Request Submitted</h2>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {transaction.transactionNo ?? transaction.id}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-black"
            onClick={() => printTransaction(transaction)}
            type="button"
          >
            <FileDown className="h-4 w-4" />
            Export PDF
          </button>
          <button
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            Not Now
          </button>
        </div>
        <button
          className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy hover:bg-surface"
          onClick={() => router.push("/logs")}
          type="button"
        >
          View Transaction Log
        </button>
      </section>
    </div>
  );
}

async function readApiMessage(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    transaction?: PrintableTransaction;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "Request failed.");
  }

  return data;
}

export function RequestCartClient({ initialAssets }: RequestCartClientProps) {
  const [assets, setAssets] = useState(initialAssets);
  const [error, setError] = useState<string | null>(null);
  const [internalRequest, setInternalRequest] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [projectRequest, setProjectRequest] = useState(false);
  const [referenceName, setReferenceName] = useState("");
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);
  const [requestDate, setRequestDate] = useState(todayInputValue());
  const [serviceRequest, setServiceRequest] = useState(false);
  const [soldPrice, setSoldPrice] = useState("");
  const [submitted, setSubmitted] = useState<PrintableTransaction | null>(null);
  const [type, setType] = useState<TransactionTypeCode>("BORROW");

  function handleTypeChange(nextType: TransactionTypeCode) {
    setType(nextType);

    if (nextType === "SOLD") {
      return;
    }

    setSoldPrice("");
  }

  function handleInternalRequestChange(checked: boolean) {
    setInternalRequest(checked);

    if (checked) {
      setServiceRequest(false);
      setProjectRequest(false);
    }
  }

  function handleServiceRequestChange(checked: boolean) {
    setServiceRequest(checked);

    if (checked) {
      setInternalRequest(false);
      setProjectRequest(false);
    }
  }

  function handleProjectRequestChange(checked: boolean) {
    setProjectRequest(checked);

    if (checked) {
      setInternalRequest(false);
      setServiceRequest(false);
    }
  }

  async function releaseAssets(assetIds: string[]) {
    const response = await fetch("/api/requests/release", {
      body: JSON.stringify({
        assetIds,
        note: "Removed from request page.",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    await readApiMessage(response);
    setAssets((current) => current.filter((asset) => !assetIds.includes(asset.id)));
  }

  async function handleRemove(assetId: string) {
    setError(null);
    setRemovingAssetId(assetId);

    try {
      await releaseAssets([assetId]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove asset.");
    } finally {
      setRemovingAssetId(null);
    }
  }

  async function handleClearAll() {
    setError(null);
    setIsClearing(true);

    try {
      await releaseAssets(assets.map((asset) => asset.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to clear request.");
    } finally {
      setIsClearing(false);
    }
  }

  function validateSubmit() {
    const missingFields: string[] = [];

    if (assets.length === 0) {
      missingFields.push("Request list");
    }

    if (!referenceName.trim()) {
      missingFields.push(getReferenceLabel(type));
    }

    if (!note.trim()) {
      missingFields.push("Use Detail");
    }

    if (!requestDate) {
      missingFields.push("Request Date");
    }

    if (!internalRequest && !serviceRequest && !projectRequest) {
      missingFields.push("Internal / Service / Project");
    }

    if (type === "SOLD" && !soldPrice.trim()) {
      missingFields.push("Price");
    }

    if (missingFields.length > 0) {
      return `Please complete: ${missingFields.join(", ")}.`;
    }

    return null;
  }

  async function fetchPrintableTransaction(transaction: PrintableTransaction) {
    if (!transaction.id) {
      return transaction;
    }

    const response = await fetch(`/api/transactions/${transaction.id}`);
    const data = await readApiMessage(response);

    return data.transaction ?? transaction;
  }

  async function handleSubmit() {
    const validationError = validateSubmit();
    setError(validationError);

    if (validationError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/transactions", {
        body: JSON.stringify({
          assetIds: assets.map((asset) => asset.id),
          dueDate: null,
          internalRequest,
          note,
          projectRequest,
          purpose: referenceName,
          requestDate,
          serviceRequest,
          soldPrice: type === "SOLD" ? soldPrice : null,
          type,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readApiMessage(response);
      const transaction = await fetchPrintableTransaction(data.transaction ?? {});
      setAssets([]);
      setSubmitted(transaction);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RequestList
          assets={assets}
          isClearing={isClearing}
          onClearAll={handleClearAll}
          onRemove={handleRemove}
          removingAssetId={removingAssetId}
        />
        <TransactionForm
          assetCount={assets.length}
          error={error}
          internalRequest={internalRequest}
          isSubmitting={isSubmitting}
          note={note}
          onInternalRequestChange={handleInternalRequestChange}
          onNoteChange={setNote}
          onProjectRequestChange={handleProjectRequestChange}
          onReferenceChange={setReferenceName}
          onRequestDateChange={setRequestDate}
          onServiceRequestChange={handleServiceRequestChange}
          onSoldPriceChange={setSoldPrice}
          onSubmit={handleSubmit}
          onTypeChange={handleTypeChange}
          projectRequest={projectRequest}
          referenceName={referenceName}
          requestDate={requestDate}
          serviceRequest={serviceRequest}
          soldPrice={soldPrice}
          type={type}
        />
      </div>
      {submitted ? (
        <SubmitDialog
          onClose={() => setSubmitted(null)}
          transaction={submitted}
        />
      ) : null}
    </div>
  );
}
