"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileDown, Loader2, MoreVertical, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  printTransaction,
  type PrintableTransaction,
} from "@/features/transactions/transaction-print";

type TransactionRowActionsProps = {
  canReturn: boolean;
  itemId: string;
  transactionId: string;
};

function ReturnModal({
  error,
  isSubmitting,
  onClose,
  onSubmit,
  returnerName,
  setReturnerName,
}: {
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  returnerName: string;
  setReturnerName: (value: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section className="w-full max-w-md rounded-md border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-accent/15 text-brand-accent">
            <Undo2 className="h-6 w-6" />
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

        <h2 className="mt-5 text-2xl font-bold text-navy">Return asset</h2>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          Tell us who physically returned this item.
        </p>

        <label className="mt-5 flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Returner Name
          <input
            className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4"
            onChange={(event) => setReturnerName(event.target.value)}
            placeholder="Enter returner name"
            value={returnerName}
          />
        </label>

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
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-bold text-white hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={onSubmit}
            type="button"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Return
          </button>
        </div>
      </section>
    </div>
  );
}

async function readPrintableTransaction(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    transaction?: PrintableTransaction;
  };

  if (!response.ok || !data.transaction) {
    throw new Error(data.message ?? "Unable to export transaction.");
  }

  return data.transaction;
}

export function TransactionRowActions({
  canReturn,
  itemId,
  transactionId,
}: TransactionRowActionsProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnerName, setReturnerName] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  async function handleExport() {
    setIsExporting(true);

    try {
      const response = await fetch(`/api/transactions/${transactionId}`);
      const transaction = await readPrintableTransaction(response);
      printTransaction(transaction);
    } finally {
      setIsExporting(false);
      setIsMenuOpen(false);
    }
  }

  async function handleReturn() {
    const trimmedName = returnerName.trim();

    if (!trimmedName) {
      setReturnError("Returner name is required.");
      return;
    }

    setReturnError(null);
    setIsReturning(true);

    try {
      const response = await fetch(
        `/api/transactions/${transactionId}/items/${itemId}/return`,
        {
          body: JSON.stringify({
            note: `Returned by ${trimmedName}`,
            returnerName: trimmedName,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to return asset.");
      }

      setShowReturnModal(false);
      setReturnerName("");
      setIsMenuOpen(false);
      router.refresh();
    } catch (caught) {
      setReturnError(caught instanceof Error ? caught.message : "Unable to return asset.");
    } finally {
      setIsReturning(false);
    }
  }

  return (
    <>
      <div className="relative inline-flex justify-end" ref={menuRef}>
        <button
          aria-label="Actions"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-navy shadow-sm hover:bg-surface"
          onClick={() => setIsMenuOpen((current) => !current)}
          type="button"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {isMenuOpen ? (
          <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-md border border-border bg-white shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-navy hover:bg-surface"
              onClick={handleExport}
              type="button"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Export PDF
            </button>
            <button
              className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-sm font-semibold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:text-muted-foreground"
              disabled={!canReturn}
              onClick={() => {
                setIsMenuOpen(false);
                setShowReturnModal(true);
              }}
              type="button"
            >
              <Undo2 className="h-4 w-4" />
              Return
            </button>
          </div>
        ) : null}
      </div>

      {showReturnModal ? (
        <ReturnModal
          error={returnError}
          isSubmitting={isReturning}
          onClose={() => {
            setShowReturnModal(false);
            setReturnError(null);
          }}
          onSubmit={handleReturn}
          returnerName={returnerName}
          setReturnerName={setReturnerName}
        />
      ) : null}
    </>
  );
}
