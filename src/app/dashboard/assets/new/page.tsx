import {
  AssetCreateForbidden,
  AssetCreatePage,
} from "@/features/assets/asset-edit-page";
import { getAssetCreateForUser, getAssetEditForUser } from "@/lib/asset-edit";
import { requireCurrentUser } from "@/lib/auth";

type AssetCreateRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AssetCreateRoute({
  searchParams,
}: AssetCreateRouteProps) {
  const params = await searchParams;
  const rawWarehouse = params.warehouse;
  const warehouse = Array.isArray(rawWarehouse) ? rawWarehouse[0] : rawWarehouse;
  const lockWarehouse = Boolean(warehouse);

  const user = await requireCurrentUser("/dashboard/assets/new");
  const sourceId = typeof params.sourceAssetId === "string" ? params.sourceAssetId : undefined;
  const source = sourceId ? await getAssetEditForUser(user, sourceId) : null;
  if (source && source.kind !== "ok") return <AssetCreateForbidden />;
  const template = source?.kind === "ok" ? source.asset : undefined;
  const result = await getAssetCreateForUser(user, template?.warehouse.code ?? warehouse);

  if (result.kind === "forbidden") {
    return <AssetCreateForbidden />;
  }

  return (
    <AssetCreatePage
      canChangeWarehouse={result.canChangeWarehouse}
      initialWarehouseCode={result.initialWarehouseCode}
      lockWarehouse={lockWarehouse}
      options={result.options}
      template={template}
    />
  );
}

