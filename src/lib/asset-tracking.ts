export const AssetTrackMethod = { SERIAL: "SERIAL", QUANTITY: "QUANTITY" } as const;
export type AssetTrackMethod = (typeof AssetTrackMethod)[keyof typeof AssetTrackMethod];

type TrackableAsset = {
  serialNo?: string | null;
  assetModel?: {
    isSerialized?: boolean;
  } | null;
};

export function getEffectiveAssetTrackMethod(asset: TrackableAsset) {
  return asset.assetModel?.isSerialized && asset.serialNo?.trim()
    ? AssetTrackMethod.SERIAL
    : AssetTrackMethod.QUANTITY;
}

export function isQuantityTrackedAsset(asset: TrackableAsset) {
  return getEffectiveAssetTrackMethod(asset) === AssetTrackMethod.QUANTITY;
}
