"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

type StatusOption = {
  label: string;
  value: string;
};

type ServerInventoryControlFilters = {
  categories: string[];
  search: string;
  statuses: string[];
  types: string[];
};

type ServerInventoryControlsProps = {
  addAssetHref?: string | null;
  categories: string[];
  filters: ServerInventoryControlFilters;
  statuses: StatusOption[];
  total: number;
  types: string[];
};

type CheckboxGroupProps = {
  name: string;
  options: string[];
  selected: string[];
  title: string;
};

function appendValues(params: URLSearchParams, key: string, values: string[]) {
  values.forEach((value) => params.append(key, value));
}

function buildHref(
  filters: ServerInventoryControlFilters,
  overrides: Partial<ServerInventoryControlFilters>,
) {
  const nextFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (nextFilters.search) {
    params.set("q", nextFilters.search);
  }

  appendValues(params, "category", nextFilters.categories);
  appendValues(params, "type", nextFilters.types);
  appendValues(params, "status", nextFilters.statuses);

  return `/dashboard/server${params.size ? `?${params.toString()}` : ""}`;
}

function HiddenFilters({ filters }: { filters: ServerInventoryControlFilters }) {
  return (
    <>
      {filters.categories.map((category) => (
        <input key={`category-${category}`} name="category" type="hidden" value={category} />
      ))}
      {filters.types.map((type) => (
        <input key={`type-${type}`} name="type" type="hidden" value={type} />
      ))}
      {filters.statuses.map((status) => (
        <input key={`status-${status}`} name="status" type="hidden" value={status} />
      ))}
    </>
  );
}

function CategoryChips({
  categories,
  filters,
}: {
  categories: string[];
  filters: ServerInventoryControlFilters;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Link
        className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
          filters.categories.length === 0
            ? "bg-navy text-white"
            : "bg-surface text-muted-foreground hover:text-navy"
        }`}
        href={buildHref(filters, { categories: [] })}
      >
        All Server Categories
      </Link>
      {categories.map((category) => {
        const isActive = filters.categories.includes(category);

        return (
          <Link
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
              isActive
                ? "bg-navy text-white"
                : "bg-surface text-muted-foreground hover:text-navy"
            }`}
            href={buildHref(filters, { categories: isActive ? [] : [category] })}
            key={category}
          >
            {category}
          </Link>
        );
      })}
    </div>
  );
}

function FilterHint({
  onOpen,
  selectedCount,
}: {
  onOpen: () => void;
  selectedCount: number;
}) {
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-md border border-border bg-white p-2 shadow-lg">
      <button
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-navy hover:bg-surface"
        onClick={onOpen}
        type="button"
      >
        <span>Advanced Filters</span>
        <ChevronDown className="h-4 w-4 -rotate-90" />
      </button>
      <p className="px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground">
        {selectedCount > 0 ? `${selectedCount} active` : "No active filters"}
      </p>
    </div>
  );
}

function FilterLauncher({
  onOpen,
  selectedCount,
}: {
  onOpen: () => void;
  selectedCount: number;
}) {
  const [isHintOpen, setIsHintOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHintOpen(true)}
      onMouseLeave={() => setIsHintOpen(false)}
    >
      <button
        className="flex h-11 items-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm transition hover:bg-surface"
        onClick={onOpen}
        type="button"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {selectedCount > 0 ? (
          <span className="rounded-full bg-brand-accent px-2 py-0.5 text-xs text-white">
            {selectedCount}
          </span>
        ) : null}
      </button>
      {isHintOpen ? <FilterHint onOpen={onOpen} selectedCount={selectedCount} /> : null}
    </div>
  );
}

function CheckboxGroup({ name, options, selected, title }: CheckboxGroupProps) {
  return (
    <section className="border-t border-border py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-4">
        {options.map((option) => (
          <label className="flex items-center gap-3 text-sm text-muted-foreground" key={option}>
            <input
              className="h-4 w-4 rounded border-border text-navy"
              defaultChecked={selected.includes(option)}
              name={name}
              type="checkbox"
              value={option}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function StatusCheckboxes({
  selected,
  statuses,
}: {
  selected: string[];
  statuses: StatusOption[];
}) {
  return (
    <section className="border-t border-border py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Status</h3>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {statuses.map((status) => (
          <label className="flex items-center gap-3 text-sm text-muted-foreground" key={status.value}>
            <input
              className="h-4 w-4 rounded border-border text-navy"
              defaultChecked={selected.includes(status.value)}
              name="status"
              type="checkbox"
              value={status.value}
            />
            <span>{status.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function FilterDrawer({
  categories,
  filters,
  isOpen,
  onClose,
  statuses,
  total,
  types,
}: ServerInventoryControlsProps & { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button className="flex-1 cursor-default" onClick={onClose} type="button" />
      <aside className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-ink">Filters</h2>
          <button className="rounded-md p-2 text-muted-foreground hover:bg-surface" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action="/dashboard/server" className="mt-6" method="get">
          <input name="q" type="hidden" value={filters.search} />
          <input name="page" type="hidden" value="1" />
          <p className="mb-5 text-sm font-medium text-muted-foreground">
            {total.toLocaleString("en-US")} matching items
          </p>
          <CheckboxGroup
            name="category"
            options={categories}
            selected={filters.categories}
            title="Category"
          />
          <CheckboxGroup name="type" options={types} selected={filters.types} title="Types" />
          <StatusCheckboxes selected={filters.statuses} statuses={statuses} />

          <div className="sticky bottom-0 -mx-6 mt-4 flex gap-3 border-t border-border bg-white px-6 py-4">
            <Link
              className="flex h-10 flex-1 items-center justify-center rounded-md border border-border text-sm font-bold text-navy"
              href="/dashboard/server"
            >
              Reset
            </Link>
            <button className="flex h-10 flex-1 items-center justify-center rounded-md bg-navy text-sm font-bold text-white" type="submit">
              <Check className="mr-2 h-4 w-4" />
              Apply
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function ServerInventoryControls({
  addAssetHref,
  categories,
  filters,
  statuses,
  total,
  types,
}: ServerInventoryControlsProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const selectedCount =
    filters.categories.length + filters.types.length + filters.statuses.length;
  const hasActiveSearchOrFilters = Boolean(filters.search) || selectedCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <CategoryChips categories={categories} filters={filters} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form action="/dashboard/server" className="relative flex-1" method="get">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-11 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
            defaultValue={filters.search}
            name="q"
            placeholder="Search model, brand, category, type, stock code, serial no."
          />
          {hasActiveSearchOrFilters ? (
            <Link
              aria-label="Clear search and filters"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-navy"
              href="/dashboard/server"
            >
              <X className="h-4 w-4" />
            </Link>
          ) : null}
          <input name="page" type="hidden" value="1" />
          <HiddenFilters filters={filters} />
        </form>

        <div className="flex items-center gap-2">
          <FilterLauncher
            onOpen={() => setIsDrawerOpen(true)}
            selectedCount={selectedCount}
          />
          {addAssetHref ? (
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm transition hover:bg-black"
              href={addAssetHref}
            >
              <Plus className="h-4 w-4" />
              Add Asset
            </Link>
          ) : null}
        </div>
      </div>

      <FilterDrawer
        categories={categories}
        filters={filters}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        statuses={statuses}
        total={total}
        types={types}
      />
    </div>
  );
}
