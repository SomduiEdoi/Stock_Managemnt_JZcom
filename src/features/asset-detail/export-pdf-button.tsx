"use client";

import { FileDown } from "lucide-react";

export function ExportPdfButton() {
  return (
    <button
      className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface"
      onClick={() => window.print()}
      type="button"
    >
      <FileDown className="h-4 w-4" />
      Export PDF
    </button>
  );
}
