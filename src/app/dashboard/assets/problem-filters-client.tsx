"use client";

import Link from "next/link";
import { useState } from "react";
import { SearchCombobox } from "@/components/form/search-combobox";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import type { AssetListFilters } from "@/lib/assets";

export function ProblemFiltersClient({
  categoryOptions,
  brandOptions,
  filters,
  statusOptions,
  statusLabels,
  typeOptions,
}: {
  brandOptions: string[];
  categoryOptions: string[];
  filters: AssetListFilters;
  statusLabels: Record<string, string>;
  statusOptions: string[];
  typeOptions: string[];
}) {
  const [status, setStatus] = useState(filters.status);
  const [brand, setBrand] = useState(filters.brand);
  const [category, setCategory] = useState(filters.category);
  const [type, setType] = useState(filters.type);
  const searchSuggestions = [
    ...brandOptions.map((value) => ({ category: "BRAND", label: value, value })),
    ...categoryOptions.map((value) => ({ category: "CATEGORY", label: value, value })),
    ...typeOptions.map((value) => ({ category: "TYPE", label: value, value })),
    ...statusOptions.map((value) => ({ category: "STATUS", label: statusLabels[value] ?? value, value: statusLabels[value] ?? value })),
  ];

  return (
    <form
      action="/dashboard/assets"
      className="grid gap-3 overflow-visible rounded-md border border-border bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_150px_180px_180px_180px_auto_auto]"
      method="get"
    >
      <input name="page" type="hidden" value="1" />
      <input name="domain" type="hidden" value={filters.domain} />
      <SearchCombobox
        categories={[
          { label: "All", value: "ALL" },
          { label: "Brand", value: "BRAND" },
          { label: "Category", value: "CATEGORY" },
          { label: "Type", value: "TYPE" },
          { label: "Status", value: "STATUS" },
        ]}
        defaultValue={filters.search}
        name="q"
        placeholder="Search model, brand, category, type, stock code, serial no."
        suggestions={searchSuggestions}
      />

      <SearchableDropdown
        name="status"
        onChange={(value) => setStatus(value as typeof status)}
        options={[
          { label: "All Problems", value: "ALL" },
          ...statusOptions.map((value) => ({
            label: statusLabels[value] ?? value,
            searchText: `${statusLabels[value] ?? value} ${value}`,
            value,
          })),
        ]}
        placeholder="All Problems"
        searchPlaceholder="Search status"
        value={status}
      />

      <SearchableDropdown
        name="brand"
        onChange={setBrand}
        options={[{ label: "All Brands", value: "ALL" }, ...brandOptions.map((value) => ({ label: value, value }))]}
        placeholder="All Brands"
        searchPlaceholder="Search brand"
        value={brand}
      />

      <SearchableDropdown
        name="category"
        onChange={setCategory}
        options={[{ label: "All Categories", value: "ALL" }, ...categoryOptions.map((value) => ({ label: value, value }))]}
        placeholder="All Categories"
        searchPlaceholder="Search category"
        value={category}
      />

      <SearchableDropdown
        name="type"
        onChange={setType}
        options={[{ label: "All Types", value: "ALL" }, ...typeOptions.map((value) => ({ label: value, value }))]}
        placeholder="All Types"
        searchPlaceholder="Search type"
        value={type}
      />

      <button
        className="h-11 rounded-md bg-navy px-4 text-sm font-bold text-white transition hover:bg-black"
        type="submit"
      >
        Apply
      </button>

      <Link
        className="flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy transition hover:bg-surface"
        href="/dashboard/assets"
      >
        Reset
      </Link>
    </form>
  );
}
