import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { normalizeServerInventoryFilters } from "@/lib/server-inventory";
import { normalizeNetworkInventoryFilters } from "@/lib/network-inventory";
import { normalizeWarehouseInventoryFilters } from "@/lib/warehouse-inventory";
import { AssetConditionBadge } from "@/components/assets/asset-condition-badge";
import { RequestableInventoryTable, normalizeTableColumns, type RequestableInventoryRow } from "./requestable-inventory-table";

describe("standard stock condition", () => {
  it.each([normalizeServerInventoryFilters, normalizeNetworkInventoryFilters, normalizeWarehouseInventoryFilters])("accepts only NEW and USED filters", (normalize) => {
    expect(normalize({ condition: ["USED", "NEW", "INVALID", "USED"] }).conditions).toEqual(["USED", "NEW"]);
    expect(normalize({ condition: "USED" }).conditions).toEqual(["USED"]);
  });
  it.each(["NEW", "USED"] as const)("renders %s from the standard field", (condition) => {
    expect(renderToStaticMarkup(React.createElement(AssetConditionBadge, { condition }))).toContain(`>${condition}</span>`);
  });
  it("supports visibility preferences for Condition", () => {
    expect(normalizeTableColumns(["condition", "status", "action"])).toEqual(["status", "condition", "action"]);
    expect(normalizeTableColumns(["status", "model", "action"])).not.toContain("condition");
  });
  it("renders USED in a table without a custom used field", () => {
    const row: RequestableInventoryRow = { id: "asset", condition: "USED", assetModel: { isSerialized: false, brand: null, category: null, name: "Cable", typeName: null }, availableQuantity: 0, totalQuantity: 0, reservedQuantity: 0, isRecommended: false, locationText: null, serialNo: null, stockCode: "ST-USED", status: "READY" };
    const html = renderToStaticMarkup(React.createElement(RequestableInventoryTable, { canDelete: false, canChangeStatus: false, canRecommend: false, canRequest: false, warehouseCode: "NETWORK", warehouseLabel: "Network", rows: [row] }));
    expect(html).toContain(">Condition<");
    expect(html).toContain(">USED</span>");
  });
});
