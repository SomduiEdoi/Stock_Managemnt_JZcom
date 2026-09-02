import { Lock } from "lucide-react";
import type { AssetEditOptions, AssetEditRecord } from "@/lib/asset-edit";
import { AssetEditForm } from "./asset-edit-form";

type AssetEditPageProps = {
  asset: AssetEditRecord;
  canChangeWarehouse: boolean;
  options: AssetEditOptions;
};

export function AssetEditPage({
  asset,
  canChangeWarehouse,
  options,
}: AssetEditPageProps) {
  return (
    <AssetEditForm
      asset={asset}
      canChangeWarehouse={canChangeWarehouse}
      lockWarehouse
      mode="edit"
      options={options}
    />
  );
}

type AssetCreatePageProps = {
  canChangeWarehouse: boolean;
  initialWarehouseCode: string;
  lockWarehouse?: boolean;
  options: AssetEditOptions;
};

export function AssetCreatePage({
  canChangeWarehouse,
  initialWarehouseCode,
  lockWarehouse,
  options,
}: AssetCreatePageProps) {
  return (
    <AssetEditForm
      canChangeWarehouse={canChangeWarehouse}
      initialWarehouseCode={initialWarehouseCode}
      lockWarehouse={lockWarehouse}
      mode="create"
      options={options}
    />
  );
}

export function AssetEditForbidden() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-bold text-navy">No edit access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account does not have permission to edit this asset.
      </p>
    </section>
  );
}

export function AssetCreateForbidden() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-bold text-navy">No add access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account does not have permission to add assets in this warehouse.
      </p>
    </section>
  );
}

