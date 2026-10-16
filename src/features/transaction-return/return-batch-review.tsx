"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, FileDown, Loader2, Save, Upload, Eye } from "lucide-react";

export type ReturnBatchReviewOutcome = {
  id: string;
  label: string;
  qty: number;
  checked: boolean;
  canCheck: boolean;
  stockOptions: { id: string; stockCode: string }[];
  stockAssetId: string | null;
  requiresStockTarget: boolean;
  sourceAssetId?: string;
  inspectionNote?: string;
  canEditInspectionNote?: boolean;
};

export type ReturnBatchReviewBatch = {
  id: string;
  requestNo: string;
  phase: string;
  requiresDocument: boolean;
  allChecked: boolean;
  hasSignedDocument: boolean;
  canCheck: boolean;
  canDownload: boolean;
  canUpload: boolean;
  outcomes: ReturnBatchReviewOutcome[];
};

export type ReturnBatchReviewProps = {
  transactionId: string;
  batches: ReturnBatchReviewBatch[];
};

async function assertResponse(response: Response, fallback: string) {
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  throw new Error(typeof body?.message === "string" ? body.message : fallback);
}

export function ReturnBatchReview({ transactionId, batches }: ReturnBatchReviewProps) {
  if (!batches.length) return null;

  return (
    <section aria-label="Return batch review" className="space-y-6">
      {batches.map((batch) => (
        <BatchReview
          key={`${transactionId}:${JSON.stringify(batch)}`}
          batch={batch}
          transactionId={transactionId}
        />
      ))}
    </section>
  );
}

function BatchReview({ batch, transactionId }: { batch: ReturnBatchReviewBatch; transactionId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [freshOptions, setFreshOptions] = useState<Record<string, ReturnBatchReviewOutcome["stockOptions"]>>({});
  const optionsFor = (outcome: ReturnBatchReviewOutcome) => freshOptions[outcome.id] ?? outcome.stockOptions;
  const [stockTargets, setStockTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(batch.outcomes.map((outcome) => [outcome.id, outcome.stockAssetId ?? ""])),
  );
  const [inspectionNotes, setInspectionNotes] = useState<Record<string, string>>(() => Object.fromEntries(batch.outcomes.map((outcome) => [outcome.id, outcome.inspectionNote ?? ""])));
  const [pending, setPending] = useState<"check" | "download" | "upload" | "notes" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eligible = batch.outcomes.filter((outcome) => batch.canCheck && outcome.canCheck && !outcome.checked);
  const selectedOutcomes = eligible.filter((outcome) => selected[outcome.id]);
  const missingTarget = selectedOutcomes.some((outcome) =>
    outcome.requiresStockTarget && !optionsFor(outcome).some((option) => option.id === stockTargets[outcome.id]),
  );
  const baseUrl = `/api/transactions/${encodeURIComponent(transactionId)}/return-batches/${encodeURIComponent(batch.id)}`;
  async function refreshStockOptions() {
    try {
      const response = await fetch(`${baseUrl}/check`, { cache: "no-store" });
      await assertResponse(response, "Unable to refresh USED stock codes.");
      const data = await response.json() as { outcomes: Array<{ id: string; stockOptions: ReturnBatchReviewOutcome["stockOptions"] }> };
      setFreshOptions(Object.fromEntries(data.outcomes.map((outcome) => [outcome.id, outcome.stockOptions])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh stock codes."); }
  }
  const buttonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy hover:border-brand-accent disabled:cursor-not-allowed disabled:opacity-50";

  const changedNotes = batch.outcomes.filter((outcome) => outcome.canEditInspectionNote && outcome.checked && inspectionNotes[outcome.id] !== (outcome.inspectionNote ?? ""));

  async function run(action: "check" | "download" | "upload" | "notes", work: () => Promise<void>) {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete the request.");
    } finally {
      setPending(null);
    }
  }

  async function submitChecks() {
    if (!selectedOutcomes.length || missingTarget) return;
    await run("check", async () => {
      const response = await fetch(`${baseUrl}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcomeIds: selectedOutcomes.map((outcome) => outcome.id),
          inspectionNotes: Object.fromEntries(selectedOutcomes.map((outcome) => [outcome.id, inspectionNotes[outcome.id] ?? ""])),
          stockTargets: Object.fromEntries(selectedOutcomes
            .filter((outcome) => outcome.requiresStockTarget)
            .map((outcome) => [outcome.id, stockTargets[outcome.id]])),
        }),
      });
      await assertResponse(response, "Unable to check return outcomes.");
      setSelected({});
      router.refresh();
    });
  }

  async function downloadDocument() {
    await run("download", async () => {
      const response = await fetch(`${baseUrl}/document`, { cache: "no-store" });
      await assertResponse(response, "Unable to download PDF.");
      const disposition = response.headers.get("Content-Disposition");
      const encodedFilename = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encodedFilename
        ? decodeURIComponent(encodedFilename)
        : disposition?.match(/filename="([^"]+)"/)?.[1] ?? `${batch.requestNo}.pdf`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      try {
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
      router.refresh();
    });
  }

  async function saveNotes() {
    await run("notes", async () => {
      const response = await fetch(`${baseUrl}/check`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionNotes: Object.fromEntries(changedNotes.map((outcome) => [outcome.id, inspectionNotes[outcome.id]])) }),
      });
      await assertResponse(response, "Unable to save inspection notes.");
      router.refresh();
    });
  }

  async function uploadDocument(file: File) {
    await run("upload", async () => {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`${baseUrl}/signed-document`, { method: "POST", body: form });
      await assertResponse(response, "Unable to upload signed PDF.");
      router.refresh();
    });
  }

  return (
    <div className="min-w-0 border-t border-border pt-4" aria-busy={pending !== null}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="min-w-0 break-words text-base font-bold text-navy">{batch.requestNo}</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="break-words font-semibold text-ink">{batch.phase}</span>
          {batch.allChecked && <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Checked</span>}
          {batch.hasSignedDocument && <><span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Signed PDF</span><a className={buttonClass} href={`${baseUrl}/signed-document`}><Eye aria-hidden="true" className="mr-2 h-4 w-4" />View uploaded PDF</a></>}
        </div>
      </div>
      <ul className="divide-y divide-border">
        {batch.outcomes.map((outcome) => {
          const editable = batch.canCheck && outcome.canCheck && !outcome.checked;
          const checkboxId = `return-check-${batch.id}-${outcome.id}`;
          return (
            <li key={outcome.id} className="grid min-w-0 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center">
              <label htmlFor={checkboxId} className="flex min-w-0 items-start gap-3 text-sm text-ink">
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
                  checked={outcome.checked || Boolean(selected[outcome.id])}
                  disabled={!editable || pending !== null}
                  onChange={(event) => setSelected((current) => ({ ...current, [outcome.id]: event.target.checked }))}
                />
                <span className="min-w-0 break-words">{outcome.label}<span className="ml-2 whitespace-nowrap font-semibold">Qty: {outcome.qty}</span></span>
              </label>
              {editable && outcome.requiresStockTarget ? (
                <div>
                <select
                  aria-label={`Stock target for ${outcome.label}`}
                  className="h-10 w-full min-w-0 rounded-md border border-border bg-white px-3 text-sm text-ink"
                  value={stockTargets[outcome.id] ?? ""}
                  disabled={pending !== null}
                  onFocus={() => void refreshStockOptions()}
                  onPointerDown={() => void refreshStockOptions()}
                  onChange={(event) => setStockTargets((current) => ({ ...current, [outcome.id]: event.target.value }))}
                >
                  <option value="">Select stock target</option>
                  {optionsFor(outcome).map((option) => <option key={option.id} value={option.id}>{option.stockCode}</option>)}
                </select>
                {outcome.sourceAssetId && <a className="mt-2 inline-flex text-sm font-semibold text-brand-accent" href={`/dashboard/assets/new?sourceAssetId=${encodeURIComponent(outcome.sourceAssetId)}`}>+ Create stock code</a>}
                {!optionsFor(outcome).length && <p className="mt-2 text-sm text-status-fail">No USED stock code exists for this model and warehouse. Ask the warehouse Storeman to create a USED stock entry first.</p>}
                </div>
              ) : outcome.stockAssetId ? (
                <span className="break-words text-sm text-ink">{outcome.stockOptions.find((option) => option.id === outcome.stockAssetId)?.stockCode ?? outcome.stockAssetId}</span>
              ) : null}
              {(outcome.canEditInspectionNote || outcome.inspectionNote) && (
                <label className="min-w-0 text-sm text-ink sm:col-span-2">
                  <span className="mb-1 block font-semibold">Storeman inspection note</span>
                  <textarea
                    aria-label={`Storeman inspection note for ${outcome.label}`}
                    className="min-h-20 w-full rounded-md border border-border bg-white px-3 py-2 text-sm disabled:bg-gray-50"
                    maxLength={2000}
                    value={inspectionNotes[outcome.id] ?? ""}
                    disabled={!outcome.canEditInspectionNote || pending !== null}
                    onChange={(event) => setInspectionNotes((current) => ({ ...current, [outcome.id]: event.target.value }))}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {changedNotes.length > 0 && <button type="button" className={buttonClass} disabled={pending !== null} onClick={() => void saveNotes()}><Save aria-hidden="true" className="h-4 w-4" />Save Inspection Notes</button>}
        {eligible.length > 0 && (
          <button type="button" className={buttonClass} disabled={pending !== null || !selectedOutcomes.length || missingTarget} onClick={() => void submitChecks()}>
            {pending === "check" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
            Check Selected
          </button>
        )}
        {batch.requiresDocument && batch.canDownload && (
          <button type="button" className={buttonClass} disabled={pending !== null || !batch.allChecked || changedNotes.length > 0} onClick={() => void downloadDocument()}>
            {pending === "download" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileDown aria-hidden="true" className="h-4 w-4" />}
            Download PDF
          </button>
        )}
        {batch.requiresDocument && batch.canUpload && (
          <>
            <button type="button" className={buttonClass} disabled={pending !== null || !batch.allChecked || changedNotes.length > 0} onClick={() => fileInput.current?.click()}>
              {pending === "upload" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}
              {batch.hasSignedDocument ? "Replace Signed PDF" : "Upload Signed PDF"}
            </button>
            <input ref={fileInput} type="file" accept=".pdf,application/pdf" aria-label="Signed PDF" className="hidden" disabled={pending !== null} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadDocument(file);
            }} />
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-3 flex items-start gap-2 break-words text-sm text-red-700"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0">{error}</span></p>}
    </div>
  );
}
