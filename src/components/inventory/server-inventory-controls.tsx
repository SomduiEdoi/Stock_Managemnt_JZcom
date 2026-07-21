"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

type StatusOption = {
  label: string;
  value: string;
};

type CategoryGroup = {
  assetCount: number;
  id: string;
  name: string;
  types: Array<{ assetCount: number; code: string | null; id: string; name: string }>;
};

type InventoryControlFilters = {
  brands: string[];
  categories: string[];
  search: string;
  sortBy: string;
  sortDirection: string;
  statuses: string[];
  types: string[];
};

type InventoryControlsProps = {
  addAssetHref?: string | null;
  baseHref?: string;
  canManageCategories?: boolean;
  domainCode?: string;
  domainLabel?: string;
  brands: string[];
  categories: string[];
  categoryGroups: CategoryGroup[];
  filters: InventoryControlFilters;
  statuses: StatusOption[];
  total: number;
  types: string[];
};

type DraftType = {
  assetCount: number;
  code: string;
  delete?: boolean;
  id?: string;
  name: string;
};

type DraftCategory = {
  assetCount: number;
  delete?: boolean;
  id?: string;
  name: string;
  types: DraftType[];
};

function appendValues(params: URLSearchParams, key: string, values: string[]) {
  values.forEach((value) => params.append(key, value));
}

function buildHref(
  baseHref: string,
  filters: InventoryControlFilters,
  overrides: Partial<InventoryControlFilters>,
) {
  const nextFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (nextFilters.search) {
    params.set("q", nextFilters.search);
  }

  appendValues(params, "brand", nextFilters.brands);
  appendValues(params, "category", nextFilters.categories);
  appendValues(params, "type", nextFilters.types);
  appendValues(params, "status", nextFilters.statuses);

  if (nextFilters.sortBy) {
    params.set("sort", nextFilters.sortBy);
  }

  if (nextFilters.sortDirection) {
    params.set("dir", nextFilters.sortDirection);
  }

  return `${baseHref}${params.size ? `?${params.toString()}` : ""}`;
}

function HiddenFilters({ filters }: { filters: InventoryControlFilters }) {
  return (
    <>
      {filters.brands.map((brand) => (
        <input key={`brand-${brand}`} name="brand" type="hidden" value={brand} />
      ))}
      {filters.categories.map((category) => (
        <input key={`category-${category}`} name="category" type="hidden" value={category} />
      ))}
      {filters.types.map((type) => (
        <input key={`type-${type}`} name="type" type="hidden" value={type} />
      ))}
      <input name="sort" type="hidden" value={filters.sortBy} />
      <input name="dir" type="hidden" value={filters.sortDirection} />
      {filters.statuses.map((status) => (
        <input key={`status-${status}`} name="status" type="hidden" value={status} />
      ))}
    </>
  );
}

function toDraftCategories(groups: CategoryGroup[]): DraftCategory[] {
  return groups.map((group) => ({
    assetCount: group.assetCount,
    id: group.id,
    name: group.name,
    types: group.types.map((type) => ({
      assetCount: type.assetCount,
      code: type.code ?? "",
      id: type.id,
      name: type.name,
    })),
  }));
}

function ManageCategoriesDialog({
  domainCode,
  domainLabel,
  initialCategory,
  groups,
  onClose,
}: {
  domainCode: string;
  domainLabel: string;
  groups: CategoryGroup[];
  initialCategory: string | null;
  onClose: () => void;
}) {
  const initialDraft = useMemo(() => {
    const draft = toDraftCategories(groups);

    if (!initialCategory) {
      return draft;
    }

    const selected = draft.find((category) => category.name === initialCategory);

    return selected ? [selected] : draft;
  }, [groups, initialCategory]);
  const [categories, setCategories] = useState<DraftCategory[]>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const isSingleCategoryMode = initialCategory !== null;
  const [isSaving, setIsSaving] = useState(false);

  const prefixOwners = useMemo(() => {
    const owners = new Map<string, string[]>();

    categories.forEach((category) => {
      if (category.delete) return;
      category.types.forEach((type) => {
        if (type.delete) return;
        const code = type.code.trim().toUpperCase();
        if (!code) return;
        owners.set(code, [...(owners.get(code) ?? []), type.id ?? `${category.name}:${type.name}`]);
      });
    });

    return owners;
  }, [categories]);

  function hasDuplicatePrefix(type: DraftType) {
    const code = type.code.trim().toUpperCase();

    if (!code) return false;

    return (prefixOwners.get(code)?.length ?? 0) > 1;
  }

  function updateCategory(index: number, patch: Partial<DraftCategory>) {
    setCategories((current) => current.map((category, i) => (i === index ? { ...category, ...patch } : category)));
  }

  function updateType(categoryIndex: number, typeIndex: number, patch: Partial<DraftType>) {
    setCategories((current) => current.map((category, i) => {
      if (i !== categoryIndex) {
        return category;
      }

      return {
        ...category,
        types: category.types.map((type, j) => (j === typeIndex ? { ...type, ...patch } : type)),
      };
    }));
  }

  function removeCategory(categoryIndex: number) {
    const category = categories[categoryIndex];

    if (
      category.assetCount > 0 &&
      !window.confirm(
        `Delete category ${category.name}? This category currently contains ${category.assetCount.toLocaleString("en-US")} assets.`,
      )
    ) {
      return;
    }

    updateCategory(categoryIndex, { delete: true });
  }

  function removeType(categoryIndex: number, typeIndex: number) {
    const type = categories[categoryIndex].types[typeIndex];

    if (
      type.assetCount > 0 &&
      !window.confirm(
        `Delete type ${type.name}? This type currently contains ${type.assetCount.toLocaleString("en-US")} assets.`,
      )
    ) {
      return;
    }

    updateType(categoryIndex, typeIndex, { delete: true });
  }

  async function save() {
    setError(null);
    const activeCategories = categories.filter((category) => !category.delete);
    const invalidCategory = activeCategories.find((category) => !category.name.trim());
    const activeTypes = activeCategories.flatMap((category) => category.types.filter((type) => !type.delete));
    const invalidType = activeTypes.find((type) => !type.name.trim());
    const duplicatePrefix = activeTypes.find(hasDuplicatePrefix);

    if (invalidCategory || invalidType) {
      setError("Category name and type name are required.");
      return;
    }

    if (duplicatePrefix) {
      setError(`Prefix ${duplicatePrefix.code.trim().toUpperCase()} is duplicated in this domain.`);
      return;
    }

    setIsSaving(true);
    const response = await fetch(`/api/domains/${encodeURIComponent(domainCode)}/categories`, {
      body: JSON.stringify({ categories }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "Unable to save categories.");
      setIsSaving(false);
      return;
    }

    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <section className="w-full max-w-4xl rounded-lg bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-navy">Manage {domainLabel} Categories & Types</h2>
          <button className="rounded-md p-2 text-muted-foreground hover:bg-surface" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="overflow-hidden rounded-md border border-ink">
            <div className="grid grid-cols-[180px_1fr_120px_170px_56px] border-b border-ink bg-surface px-3 py-2 text-sm font-semibold text-navy">
              <span>Categories</span>
              <span>Types</span>
              <span>Prefix</span>
              <span className="text-center">Action</span>
              <span />
            </div>

            <div>
              {categories.map((category, categoryIndex) => {
                if (category.delete) {
                  return null;
                }

                const visibleTypes = category.types.filter((type) => !type.delete);

                return (
                  <div className="border-b border-border px-2 py-3 last:border-b-0" key={category.id ?? `new-${categoryIndex}`}>
                    <div className="grid grid-cols-[180px_1fr_120px_170px_56px] gap-3">
                      <div>
                        <input
                          className="h-9 w-full rounded-md border border-ink bg-white px-2 text-sm text-navy outline-none focus:ring-2 focus:ring-brand-accent/30"
                          onChange={(event) => updateCategory(categoryIndex, { name: event.target.value })}
                          placeholder="Category"
                          value={category.name}
                        />
                        <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                          {category.assetCount.toLocaleString("en-US")} assets
                        </p>
                      </div>

                      <div className="col-span-3 flex flex-col gap-2">
                        {visibleTypes.map((type, visibleTypeIndex) => {
                          const typeIndex = category.types.indexOf(type);
                          const duplicate = hasDuplicatePrefix(type);

                          return (
                            <div className="grid grid-cols-[1fr_120px_92px_40px] gap-3" key={type.id ?? `${categoryIndex}-${visibleTypeIndex}`}>
                              <input
                                className="h-9 rounded-md border border-ink bg-white px-2 text-sm text-navy outline-none focus:ring-2 focus:ring-brand-accent/30"
                                onChange={(event) => updateType(categoryIndex, typeIndex, { name: event.target.value })}
                                placeholder="Type"
                                value={type.name}
                              />
                              <div>
                                <input
                                  aria-readonly={Boolean(type.id)}
                                  className={`h-9 w-full rounded-md border px-2 text-sm font-semibold uppercase text-navy outline-none focus:ring-2 focus:ring-brand-accent/30 ${
                                    type.id ? "bg-surface" : "bg-white"
                                  } ${duplicate ? "border-red-500" : "border-ink"}`}
                                  onChange={(event) => {
                                    if (!type.id) {
                                      updateType(categoryIndex, typeIndex, { code: event.target.value });
                                    }
                                  }}
                                  placeholder="Prefix"
                                  readOnly={Boolean(type.id)}
                                  title={type.id ? "Type prefix is locked after creation. New stock codes will continue using this prefix." : "Enter type prefix"}
                                  value={type.code}
                                />
                                {duplicate ? <p className="mt-1 text-[10px] font-bold text-red-600">Duplicate</p> : null}
                              </div>
                              <button
                                className="h-9 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-black"
                                onClick={save}
                                type="button"
                              >
                                Save
                              </button>
                              <button
                                className="flex h-9 items-center justify-center rounded-md text-xl font-bold text-red-500 hover:bg-red-50"
                                onClick={() => removeType(categoryIndex, typeIndex)}
                                type="button"
                              >
                                X
                              </button>
                              <p className="col-span-4 -mt-1 text-[11px] font-semibold text-muted-foreground">
                                {type.assetCount.toLocaleString("en-US")} assets
                              </p>
                            </div>
                          );
                        })}

                        <button
                          className="h-9 rounded-md border border-ink bg-surface text-sm font-semibold text-navy hover:bg-white"
                          onClick={() => updateCategory(categoryIndex, { types: [...category.types, { assetCount: 0, code: "", name: "" }] })}
                          type="button"
                        >
                          + Add Types
                        </button>
                      </div>

                      <button
                        className="flex h-12 items-center justify-center self-center rounded-md text-red-500 hover:bg-red-50"
                        onClick={() => removeCategory(categoryIndex)}
                        type="button"
                      >
                        <Trash2 className="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {!isSingleCategoryMode ? (
                <div className="p-4">
                  <button
                    className="h-9 w-full rounded-md border border-ink bg-surface text-sm font-semibold text-navy hover:bg-white"
                    onClick={() => setCategories((current) => [...current, { assetCount: 0, name: "", types: [] }])}
                    type="button"
                  >
                    + Add Categories
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Showing {groups.length} active categories.</p>
          <div className="flex gap-3">
            <button className="h-10 rounded-md border border-border px-5 text-sm font-bold text-navy" onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="h-10 rounded-md bg-navy px-5 text-sm font-bold text-white disabled:opacity-60"
              disabled={isSaving}
              onClick={save}
              type="button"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function CategoryChips({
  baseHref,
  canManageCategories,
  categories,
  domainCode,
  domainLabel,
  filters,
  groups,
}: {
  canManageCategories: boolean;
  baseHref: string;
  categories: string[];
  domainCode: string;
  domainLabel: string;
  filters: InventoryControlFilters;
  groups: CategoryGroup[];
}) {
  const [dialogCategory, setDialogCategory] = useState<string | null | undefined>(undefined);

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="group relative shrink-0">
          <Link
            className={`block rounded-full px-4 py-2 pr-9 text-xs font-bold transition ${
              filters.categories.length === 0
                ? "bg-brand-accent text-white"
                : "bg-surface text-muted-foreground hover:text-navy"
            }`}
            href={buildHref(baseHref, filters, { categories: [] })}
          >
            All Categories
          </Link>
          {canManageCategories ? (
            <button
              aria-label="Manage all categories"
              className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-current group-hover:flex"
              onClick={() => setDialogCategory(null)}
              type="button"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {categories.map((category) => {
          const isActive = filters.categories.includes(category);

          return (
            <div className="group relative shrink-0" key={category}>
              <Link
                className={`block rounded-full px-4 py-2 pr-9 text-xs font-bold transition ${
                  isActive
                    ? "bg-brand-accent text-white"
                    : "bg-surface text-muted-foreground hover:text-navy"
                }`}
                href={buildHref(baseHref, filters, { categories: isActive ? [] : [category] })}
              >
                {category}
              </Link>
              {canManageCategories ? (
                <button
                  aria-label={`Manage ${category}`}
                  className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-current group-hover:flex"
                  onClick={() => setDialogCategory(category)}
                  type="button"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {dialogCategory !== undefined ? (
        <ManageCategoriesDialog
          domainCode={domainCode}
          domainLabel={domainLabel}
          groups={groups}
          initialCategory={dialogCategory}
          onClose={() => setDialogCategory(undefined)}
        />
      ) : null}
    </>
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

function BrandFilters({
  brands,
  selectedBrands,
}: {
  brands: string[];
  selectedBrands: string[];
}) {
  if (brands.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-border py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Brand</h3>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {brands.map((brand) => (
          <label className="flex items-center gap-3 text-sm text-muted-foreground" key={brand}>
            <input
              className="h-4 w-4 rounded border-border text-navy"
              defaultChecked={selectedBrands.includes(brand)}
              name="brand"
              type="checkbox"
              value={brand}
            />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={brand}>
              {brand}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function CategoryTypeFilters({
  groups,
  selectedCategories,
  selectedTypes,
}: {
  groups: CategoryGroup[];
  selectedCategories: string[];
  selectedTypes: string[];
}) {
  return (
    <section className="border-t border-border py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Category & Type</h3>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div className="rounded-md border border-border p-3" key={group.id}>
            <label className="flex items-center justify-between gap-3 text-sm font-bold text-ink">
              <span className="flex items-center gap-3">
                <input
                  className="h-4 w-4 rounded border-border text-navy"
                  defaultChecked={selectedCategories.includes(group.name)}
                  name="category"
                  type="checkbox"
                  value={group.name}
                />
                {group.name}
              </span>
              <span className="text-xs text-muted-foreground">{group.assetCount}</span>
            </label>
            {group.types.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3 border-l border-border pl-5">
                {group.types.map((type) => (
                  <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground" key={type.id}>
                    <span className="flex items-center gap-3">
                      <input
                        className="h-4 w-4 rounded border-border text-navy"
                        defaultChecked={selectedTypes.includes(type.name)}
                        name="type"
                        type="checkbox"
                        value={type.name}
                      />
                      {type.name}
                    </span>
                    <span className="text-xs">{type.assetCount}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function FilterDrawer({
  baseHref = "/dashboard/server",
  brands,
  categoryGroups,
  filters,
  isOpen,
  onClose,
  statuses,
  total,
}: InventoryControlsProps & { isOpen: boolean; onClose: () => void }) {
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

        <form action={baseHref} className="mt-6" method="get">
          <input name="q" type="hidden" value={filters.search} />
          <input name="page" type="hidden" value="1" />
          <input name="sort" type="hidden" value={filters.sortBy} />
          <input name="dir" type="hidden" value={filters.sortDirection} />
          <p className="mb-5 text-sm font-medium text-muted-foreground">
            {total.toLocaleString("en-US")} matching items
          </p>
          <BrandFilters brands={brands} selectedBrands={filters.brands} />
          <CategoryTypeFilters
            groups={categoryGroups}
            selectedCategories={filters.categories}
            selectedTypes={filters.types}
          />
          <StatusCheckboxes selected={filters.statuses} statuses={statuses} />

          <div className="sticky bottom-0 -mx-6 mt-4 flex gap-3 border-t border-border bg-white px-6 py-4">
            <Link
              className="flex h-10 flex-1 items-center justify-center rounded-md border border-border text-sm font-bold text-navy"
              href={baseHref}
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
  baseHref = "/dashboard/server",
  canManageCategories = false,
  brands,
  categories,
  categoryGroups,
  domainCode = "SERVER",
  domainLabel = "Server",
  filters,
  statuses,
  total,
}: InventoryControlsProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const selectedCount =
    filters.brands.length + filters.categories.length + filters.types.length + filters.statuses.length;
  const hasActiveSearchOrFilters = Boolean(filters.search) || selectedCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <CategoryChips
        baseHref={baseHref}
        canManageCategories={canManageCategories}
        categories={categories}
        domainCode={domainCode}
        domainLabel={domainLabel}
        filters={filters}
        groups={categoryGroups}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form action={baseHref} className="relative flex-1" method="get">
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
              href={baseHref}
            >
              <X className="h-4 w-4" />
            </Link>
          ) : null}
          <input name="page" type="hidden" value="1" />
          <input name="sort" type="hidden" value={filters.sortBy} />
          <input name="dir" type="hidden" value={filters.sortDirection} />
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
        addAssetHref={addAssetHref}
        baseHref={baseHref}
        canManageCategories={canManageCategories}
        brands={brands}
        categories={categories}
        categoryGroups={categoryGroups}
        domainCode={domainCode}
        domainLabel={domainLabel}
        filters={filters}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        statuses={statuses}
        total={total}
        types={[]}
      />
    </div>
  );
}
