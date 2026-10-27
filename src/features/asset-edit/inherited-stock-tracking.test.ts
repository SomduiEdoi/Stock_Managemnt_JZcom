import { describe, expect, it } from "vitest";
import { inheritedStockTracking } from "./inherited-stock-tracking";
const source = { serialNo: null as string | null, warehouse: { code: "SALE_STOCK" }, assetModel: {
  isSerialized: true, name: "Cable", brand: "UGREEN", modelNo: null, partNo: null, typeName: "HDMI", category: { name: "Cables" },
} };
const identity = { warehouseCode: "SALE_STOCK", modelName: "Cable", brand: "UGREEN", modelNo: "", partNo: "", typeName: "HDMI", categoryName: "Cables" };
describe("new stock code tracking inheritance", () => {
  it("inherits Quantity for a serial-capable model whose source is quantity-tracked", () => expect(inheritedStockTracking(source, identity)).toBe("QUANTITY"));
  it("inherits Quantity from a quantity model", () => expect(inheritedStockTracking({ ...source, assetModel: { ...source.assetModel, isSerialized: false } }, identity)).toBe("QUANTITY"));
  it("inherits Serialized from a source with a serial", () => expect(inheritedStockTracking({ ...source, serialNo: "SN-1" }, identity)).toBe("SERIAL"));
  it.each(Object.keys(identity) as Array<keyof typeof identity>)("does not apply the old source after changing %s", (key) => expect(inheritedStockTracking(source, { ...identity, [key]: "Different" })).toBeNull());
  it("does not affect an ordinary Add Asset form", () => expect(inheritedStockTracking(undefined, identity)).toBeNull());
});
