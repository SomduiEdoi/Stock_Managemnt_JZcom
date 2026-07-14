"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { downloadTransactionPdf } from "@/features/transactions/transaction-pdf-download";

type TransactionExportButtonProps = {
  transactionId: string;
};

export function TransactionExportButton({
  transactionId,
}: TransactionExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleExport() {
    setIsLoading(true);

    try {
      await downloadTransactionPdf(transactionId);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      aria-label="Export PDF"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-navy shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isLoading}
      onClick={handleExport}
      type="button"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
    </button>
  );
}
