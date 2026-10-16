import { describe, expect, it } from "vitest";
import {
  getWarehouseAccess,
  getSelectedWarehouseCodes,
  getVisibleWarehouseCodes,
  normalizeAssetListFilters,
} from "./assets";
import type { PermissionUser } from "./permissions";

const arm: PermissionUser = {
  roles: ["STOREMAN"],
  permissions: [
    { warehouseCode: "SERVER", canView: true, canManage: true },
    { warehouseCode: "NETWORK", canView: true, canManage: false },
  ],
};

describe("asset list permissions", () => {
  it("returns all warehouses for admin", () => {
    expect(getVisibleWarehouseCodes({ roles: ["ADMIN"], permissions: [] })).toEqual(
      ["SERVER", "NETWORK"],
    );
  });

  it("marks warehouse access as manage or read-only", () => {
    expect(getWarehouseAccess(arm, "SERVER")).toBe("MANAGE");
    expect(getWarehouseAccess(arm, "NETWORK")).toBe("READ_ONLY");
  });

  it("does not select a hidden filtered warehouse", () => {
    const serverOnly: PermissionUser = {
      roles: ["STOREMAN"],
      permissions: [{ warehouseCode: "SERVER", canView: true, canManage: true }],
    };

    expect(getSelectedWarehouseCodes(serverOnly, "NETWORK")).toEqual([]);
  });
});

describe("asset list filters", () => {
  it("preserves dynamic warehouse params and normalizes invalid non-warehouse params", () => {
    expect(
      normalizeAssetListFilters({
        warehouse: "BARBIE",
        page: "-1",
        q: "  fan  ",
        status: "MISSING",
      }),
    ).toMatchObject({
      brand: "ALL",
      warehouse: "BARBIE",
      page: 1,
      search: "fan",
      status: "ALL",
    });
  });
});
