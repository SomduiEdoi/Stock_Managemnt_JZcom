"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { downloadTransactionPdf } from "@/features/transactions/transaction-pdf-download";

type TransactionRowActionsProps = {
  transactionId: string;
};

export function TransactionRowActions({
  transactionId,
}: TransactionRowActionsProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);

    try {
      await downloadTransactionPdf(transactionId);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isExporting}
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
  );
}
