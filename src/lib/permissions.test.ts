import { describe, expect, it } from "vitest";
import {
  PermissionError,
  assertCanManageDomain,
  canManageDomain,
  canManageDomainForUser,
  canViewDomain,
  canViewDomainForUser,
  type DomainPermission,
  type PermissionUser,
} from "./permissions";

const permissions: DomainPermission[] = [
  { domainCode: "SERVER", canView: true, canManage: true },
  { domainCode: "NETWORK", canView: true, canManage: false },
];

describe("domain permissions", () => {
  it("allows managing only domains with canManage", () => {
    expect(canManageDomain(permissions, "SERVER")).toBe(true);
    expect(canManageDomain(permissions, "NETWORK")).toBe(false);
  });

  it("allows read-only access when canView is true", () => {
    expect(canViewDomain(permissions, "SERVER")).toBe(true);
    expect(canViewDomain(permissions, "NETWORK")).toBe(true);
  });

  it("lets admin manage all domains", () => {
    const admin: PermissionUser = {
      roles: ["ADMIN"],
      permissions: [],
    };

    expect(canManageDomainForUser(admin, "SERVER")).toBe(true);
    expect(canManageDomainForUser(admin, "NETWORK")).toBe(true);
  });

  it("keeps viewer read-only", () => {
    const viewer: PermissionUser = {
      roles: ["VIEWER"],
      permissions: [
        { domainCode: "SERVER", canView: true, canManage: false },
        { domainCode: "NETWORK", canView: true, canManage: false },
      ],
    };

    expect(canViewDomainForUser(viewer, "SERVER")).toBe(true);
    expect(canManageDomainForUser(viewer, "SERVER")).toBe(false);
  });

  it("throws for forbidden manage actions", () => {
    const arm: PermissionUser = {
      roles: ["STOCK_OWNER"],
      permissions,
    };

    expect(() => assertCanManageDomain(arm, "NETWORK")).toThrow(
      PermissionError,
    );
  });
});
