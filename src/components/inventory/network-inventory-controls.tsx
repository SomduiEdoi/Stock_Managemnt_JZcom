"use client";

import { ServerInventoryControls } from "@/components/inventory/server-inventory-controls";

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

type NetworkInventoryControlFilters = {
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
      domainCode="NETWORK"
      domainLabel="Network"
    />
  );
}
