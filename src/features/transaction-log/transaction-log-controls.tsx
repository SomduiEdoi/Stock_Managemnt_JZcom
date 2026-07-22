"use client";

import { useMemo, useState } from "react";
import { SearchCombobox } from "@/components/form/search-combobox";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import type { TransactionLogFilters, TransactionLogRow } from "@/lib/transaction-log";

export function TransactionLogControls({
  filters,
  statusChoices,
  rows,
  statusLabels,
}: {
  filters: TransactionLogFilters;
  rows: TransactionLogRow[];
  statusChoices: string[];
  statusLabels: Record<string, string>;
}) {
  const [status, setStatus] = useState(filters.status);
  const searchSuggestions = useMemo(() => rows.flatMap((row) => [
    { category: "REQ", label: row.transactionNo ?? row.id, value: row.transactionNo ?? row.id },
    ...(row.requestedBy?.name ? [{ category: "BORROWER", label: row.requestedBy.name, searchText: row.requestedBy.email ?? "", value: row.requestedBy.name }] : []),
    ...row.items
      .filter((item) => item.returnedBy?.name)
      .map((item) => ({
        category: "RETURNER",
        label: item.returnedBy?.name ?? "",
        searchText: item.returnedBy?.email ?? "",
        value: item.returnedBy?.name ?? "",
      })),
    ...row.items.map((item) => ({
      category: "ASSET",
      label: item.asset.assetModel.name,
      searchText: `${item.asset.serialNo ?? ""} ${item.asset.stockCode ?? ""}`,
      value: item.asset.assetModel.name,
    })),
  ]), [rows]);

  return (
    <form
      action="/logs"
      className="rounded-md border border-border bg-white p-4 shadow-sm"
      method="get"
    >
      <input name="scope" type="hidden" value={filters.scope} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
        <SearchCombobox
          categories={[
            { label: "All", value: "ALL" },
            { label: "Req No.", value: "REQ" },
            { label: "Borrower", value: "BORROWER" },
            { label: "Returner", value: "RETURNER" },
            { label: "Asset", value: "ASSET" },
          ]}
          defaultValue={filters.search}
          name="q"
          placeholder="Search transaction id, borrower, model, serial no."
          suggestions={searchSuggestions}
        />

        <SearchableDropdown
          name="status"
          onChange={(value) => setStatus(value as typeof status)}
          options={[
            { label: "All status", value: "ALL" },
            ...statusChoices.map((choice) => ({
              label: statusLabels[choice] ?? choice,
              searchText: `${statusLabels[choice] ?? choice} ${choice}`,
              value: choice,
            })),
          ]}
          placeholder="All status"
          searchPlaceholder="Search status"
          value={status}
        />

        <button className="sr-only" type="submit">
          Search
        </button>
      </div>
    </form>
  );
}
