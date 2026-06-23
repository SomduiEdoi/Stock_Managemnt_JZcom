"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import {
  openTransactionPrintWindow,
  printTransaction,
  type PrintableTransaction,
} from "@/features/transactions/transaction-print";

type TransactionRowActionsProps = {
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
  transactionId,
}: TransactionRowActionsProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    const popup = openTransactionPrintWindow();
    setIsExporting(true);

    try {
      const response = await fetch(`/api/transactions/${transactionId}`);
      const transaction = await readPrintableTransaction(response);
      printTransaction(transaction, popup);
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
