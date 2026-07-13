"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

export function ApprovalRowActions({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    setIsApproving(true);

    try {
      const response = await fetch(`/api/transactions/${transactionId}/approve`, {
        body: JSON.stringify({ comment: null }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to approve transaction.");
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to approve transaction.");
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-brand-accent px-3 text-sm font-bold text-white shadow-sm hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isApproving}
        onClick={handleApprove}
        type="button"
      >
        {isApproving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Approve
      </button>
      {error ? <p className="max-w-44 text-xs font-semibold text-status-fail">{error}</p> : null}
    </div>
  );
}
