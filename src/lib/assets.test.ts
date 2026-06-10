import { describe, expect, it } from "vitest";
import {
  getDomainAccess,
  getSelectedDomainCodes,
  getVisibleDomainCodes,
  normalizeAssetListFilters,
} from "./assets";
import type { PermissionUser } from "./permissions";

const arm: PermissionUser = {
  roles: ["STOCK_OWNER"],
  permissions: [
    { domainCode: "SERVER", canView: true, canManage: true },
    { domainCode: "NETWORK", canView: true, canManage: false },
  ],
};

describe("asset list permissions", () => {
  it("returns all domains for admin", () => {
    expect(getVisibleDomainCodes({ roles: ["ADMIN"], permissions: [] })).toEqual(
      ["SERVER", "NETWORK"],
    );
  });

  it("marks domain access as manage or read-only", () => {
    expect(getDomainAccess(arm, "SERVER")).toBe("MANAGE");
    expect(getDomainAccess(arm, "NETWORK")).toBe("READ_ONLY");
  });

  it("does not select a hidden filtered domain", () => {
    const serverOnly: PermissionUser = {
      roles: ["STOCK_OWNER"],
      permissions: [{ domainCode: "SERVER", canView: true, canManage: true }],
    };

    expect(getSelectedDomainCodes(serverOnly, "NETWORK")).toEqual([]);
  });
});

describe("asset list filters", () => {
  it("normalizes invalid params to defaults", () => {
    expect(
      normalizeAssetListFilters({
        domain: "INVALID",
        page: "-1",
        q: "  fan  ",
        status: "MISSING",
      }),
    ).toMatchObject({
      domain: "ALL",
      page: 1,
      search: "fan",
      status: "ALL",
    });
  });
});
