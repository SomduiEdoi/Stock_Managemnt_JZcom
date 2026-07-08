import { Lock } from "lucide-react";
import type { AssetEditOptions, AssetEditRecord } from "@/lib/asset-edit";
import { AssetEditForm } from "./asset-edit-form";

type AssetEditPageProps = {
  asset: AssetEditRecord;
  canChangeDomain: boolean;
  options: AssetEditOptions;
};

export function AssetEditPage({
  asset,
  canChangeDomain,
  options,
}: AssetEditPageProps) {
  return (
    <AssetEditForm
      asset={asset}
      canChangeDomain={canChangeDomain}
      lockDomain
      mode="edit"
      options={options}
    />
  );
}

type AssetCreatePageProps = {
  canChangeDomain: boolean;
  initialDomainCode: string;
  lockDomain?: boolean;
  options: AssetEditOptions;
};

export function AssetCreatePage({
  canChangeDomain,
  initialDomainCode,
  lockDomain,
  options,
}: AssetCreatePageProps) {
  return (
    <AssetEditForm
      canChangeDomain={canChangeDomain}
      initialDomainCode={initialDomainCode}
      lockDomain={lockDomain}
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
        Your account does not have permission to add assets in this domain.
      </p>
    </section>
  );
}

