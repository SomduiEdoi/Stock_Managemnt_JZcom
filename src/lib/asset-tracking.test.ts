import { describe, expect, it } from "vitest";
import { AssetTrackMethod, getEffectiveAssetTrackMethod } from "@/lib/asset-tracking";

describe("getEffectiveAssetTrackMethod", () => {
  it("tracks quantity products as quantity", () => {
    expect(getEffectiveAssetTrackMethod({
      serialNo: null,
      assetModel: { isSerialized: false },
    })).toBe(AssetTrackMethod.QUANTITY);
  });

  it("tracks a serialized product with a serial number as one serialized asset", () => {
    expect(getEffectiveAssetTrackMethod({
      serialNo: "SN-001",
      assetModel: { isSerialized: true },
    })).toBe(AssetTrackMethod.SERIAL);
  });

  it.each([null, "", "   "])("uses quantity when a serialized product has no serial number (%s)", (serialNo) => {
    expect(getEffectiveAssetTrackMethod({ serialNo, assetModel: { isSerialized: true } })).toBe(AssetTrackMethod.QUANTITY);
  });

  it("treats incomplete records as quantity", () => {
    expect(getEffectiveAssetTrackMethod({})).toBe(AssetTrackMethod.QUANTITY);
  });
});
