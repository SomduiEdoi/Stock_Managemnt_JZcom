import { getEffectiveAssetTrackMethod } from "@/lib/asset-tracking";

type ModelIdentity = {
  warehouseCode: string; categoryName: string; typeName: string; brand: string;
  modelName: string; modelNo: string; partNo: string;
};
type SourceAsset = {
  serialNo: string | null;
  warehouse: { code: string };
  assetModel: {
    isSerialized: boolean; name: string; brand: string | null; modelNo: string | null;
    partNo: string | null; typeName: string | null; category: { name: string } | null;
  };
};

export function inheritedStockTracking(source: SourceAsset | undefined, identity: ModelIdentity) {
  if (!source) return null;
  const model = source.assetModel;
  if (identity.warehouseCode !== source.warehouse.code || identity.categoryName !== (model.category?.name ?? "")
    || identity.typeName !== (model.typeName ?? "") || identity.brand !== (model.brand ?? "")
    || identity.modelName !== model.name || identity.modelNo !== (model.modelNo ?? "") || identity.partNo !== (model.partNo ?? "")) return null;
  return getEffectiveAssetTrackMethod(source);
}
