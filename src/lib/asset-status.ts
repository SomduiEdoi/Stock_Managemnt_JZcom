export const ASSET_STATUSES = [
  "READY",
  "REQUEST",
  "BORROW",
  "USING",
  "SOLD",
  "FAIL",
  "LOST",
  "NEED_CHECK",
] as const;

export type AssetStatusCode = (typeof ASSET_STATUSES)[number];

export const NOTE_REQUIRED_STATUSES = new Set<AssetStatusCode>([
  "BORROW",
  "USING",
  "SOLD",
  "FAIL",
  "LOST",
  "NEED_CHECK",
]);

export function isAssetStatus(value: string): value is AssetStatusCode {
  return ASSET_STATUSES.includes(value as AssetStatusCode);
}
