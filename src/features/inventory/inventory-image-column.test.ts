import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetStatus } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { RequestableInventoryTable, normalizeTableColumns, type RequestableInventoryRow } from "./requestable-inventory-table";
describe("inventory image column", () => {
  it("positions Image before Status when selected", () => {
    expect(normalizeTableColumns(["model", "status", "image", "action", "image"])).toEqual(["image", "status", "model", "action"]);
  });
  it("does not add Image to previously saved columns", () => {
    expect(normalizeTableColumns(["model", "status", "action"])).toEqual(["status", "model", "action"]);
  });
  it("renders a thumbnail inside a table cell by default", () => {
    const row: RequestableInventoryRow = { id: "asset", assetModel: { isSerialized: false, brand: null, category: null, name: "Cable", typeName: null }, availableQuantity: 1, totalQuantity: 1, reservedQuantity: 0, imageRef: "/uploads/cable.png", isRecommended: false, locationText: null, serialNo: null, stockCode: "ST-01", status: AssetStatus.READY };
    const html = renderToStaticMarkup(React.createElement(RequestableInventoryTable, { canDelete: false, canChangeStatus: false, canRecommend: false, canRequest: false, warehouseCode: "NETWORK", warehouseLabel: "Network", rows: [row] }));
    expect(html).toContain("Enlarge image of Cable");
    expect(html).toMatch(/<td[^>]*><button[^>]*aria-label="Enlarge image/);
    expect(html.indexOf(">Image<")).toBeLessThan(html.indexOf(">Status<"));
  });
});
