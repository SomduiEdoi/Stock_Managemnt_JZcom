"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, FileDown, Loader2 } from "lucide-react";
import { downloadTransactionPdf } from "@/features/transactions/transaction-pdf-download";

type TransactionRowActionsProps = {
  transactionId: string;
  canCancel: boolean;
};

export function TransactionRowActions({
  canCancel,
  transactionId,
}: TransactionRowActionsProps) {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  async function handleExport() {
    setIsExporting(true);

    try {
      await downloadTransactionPdf(transactionId);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Are you sure you want to cancel this request?")) return;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/transactions/${transactionId}/cancel`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        window.alert(data.message ?? "Unable to cancel request.");
        return;
      }
      router.refresh();
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60" disabled={isExporting || isCancelling} onClick={handleExport} type="button">
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Export PDF
      </button>
      {canCancel ? (
        <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-status-fail bg-white px-3 text-sm font-bold text-status-fail hover:bg-status-fail/10 disabled:cursor-not-allowed disabled:opacity-60" disabled={isExporting || isCancelling} onClick={handleCancel} type="button">
          {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Cancel
        </button>
      ) : null}
    </div>
  );
}
