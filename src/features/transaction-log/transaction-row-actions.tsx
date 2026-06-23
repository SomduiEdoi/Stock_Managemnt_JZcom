"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileDown, Loader2, MoreVertical, Undo2 } from "lucide-react";
import {
  printTransaction,
  type PrintableTransaction,
} from "@/features/transactions/transaction-print";

type TransactionRowActionsProps = {
  canReturn: boolean;
  transactionId: string;
};

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
  transactionId,
}: TransactionRowActionsProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  return (
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
          {canReturn ? (
            <Link
              className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-sm font-semibold text-navy hover:bg-surface"
              href={`/logs/${transactionId}/return`}
              onClick={() => setIsMenuOpen(false)}
            >
              <Undo2 className="h-4 w-4" />
              Return
            </Link>
          ) : (
            <span className="flex w-full cursor-not-allowed items-center gap-2 border-t border-border px-4 py-3 text-sm font-semibold text-muted-foreground">
              <Undo2 className="h-4 w-4" />
              Return
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
