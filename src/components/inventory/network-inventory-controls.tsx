"use client";

import { ServerInventoryControls } from "@/components/inventory/server-inventory-controls";

type StatusOption = {
  label: string;
  value: string;
};

type InventoryCategoryCustomField = {
  dataType: "TEXT" | "NUMBER" | "DROPDOWN" | "BOOLEAN";
  id: string;
  isFilterable: boolean;
  isRequired: boolean;
  isSearchable: boolean;
  key: string;
  label: string;
  options: string[];
  placeholder: string | null;
  sortOrder: number;
  unit: string | null;
};

type CategoryGroup = {
  assetCount: number;
  code: string | null;
  id: string;
  name: string;
  customFields: InventoryCategoryCustomField[];
  types: Array<{ assetCount: number; code: string | null; id: string; name: string }>;
};

type NetworkInventoryControlFilters = {
  brands: string[];
  categories: string[];
  search: string;
  sortBy: string;
  sortDirection: string;
  statuses: string[];
  types: string[];
};

type NetworkInventoryControlsProps = {
  addAssetHref?: string | null;
  canManageCategories?: boolean;
  brands: string[];
  categories: string[];
  categoryGroups: CategoryGroup[];
  filters: NetworkInventoryControlFilters;
  statuses: StatusOption[];
  total: number;
  types: string[];
};

export function NetworkInventoryControls(props: NetworkInventoryControlsProps) {
  return (
    <ServerInventoryControls
      {...props}
      baseHref="/dashboard/network"
      warehouseCode="NETWORK"
      warehouseLabel="Network"
    />
  );
}
