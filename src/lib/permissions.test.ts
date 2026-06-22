import { describe, expect, it } from "vitest";
import {
  PermissionError,
  assertCanRequestDomain,
  canChangeAssetStatusForUser,
  canDeleteAssetsForUser,
  canRequestAssetsForUser,
  canRequestDomainForUser,
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

  it("keeps staff read-only", () => {
    const staff: PermissionUser = {
      roles: ["STAFF"],
      permissions: [
        { domainCode: "SERVER", canView: true, canManage: false },
        { domainCode: "NETWORK", canView: true, canManage: false },
      ],
    };

    expect(canViewDomainForUser(staff, "SERVER")).toBe(true);
    expect(canRequestDomainForUser(staff, "SERVER")).toBe(true);
    expect(canManageDomainForUser(staff, "SERVER")).toBe(false);
  });

  it("throws for forbidden manage actions", () => {
    const arm: PermissionUser = {
      roles: ["SERVER_OWNER"],
      permissions,
    };

    expect(() => assertCanManageDomain(arm, "NETWORK")).toThrow(
      PermissionError,
    );
  });

  it("keeps stock owners out of request flow while allowing managed-domain actions", () => {
    const arm: PermissionUser = {
      roles: ["SERVER_OWNER"],
      permissions,
    };

    expect(canRequestDomainForUser(arm, "SERVER")).toBe(false);
    expect(canRequestDomainForUser(arm, "NETWORK")).toBe(false);
    expect(canDeleteAssetsForUser(arm, "SERVER")).toBe(true);
    expect(canChangeAssetStatusForUser(arm, "SERVER")).toBe(true);
    expect(canDeleteAssetsForUser(arm, "NETWORK")).toBe(false);
    expect(canManageDomainForUser(arm, "NETWORK")).toBe(false);
  });

  it("keeps admin out of request flow", () => {
    const admin: PermissionUser = {
      roles: ["ADMIN"],
      permissions: [],
    };

    expect(canRequestAssetsForUser(admin)).toBe(false);
    expect(canDeleteAssetsForUser(admin, "SERVER")).toBe(true);
    expect(canChangeAssetStatusForUser(admin, "NETWORK")).toBe(true);
  });

  it("blocks requests when a user cannot view the domain", () => {
    const serverOnlyStaff: PermissionUser = {
      roles: ["STAFF"],
      permissions: [{ domainCode: "SERVER", canView: true, canManage: false }],
    };

    expect(canRequestAssetsForUser(serverOnlyStaff)).toBe(true);
    expect(canRequestDomainForUser(serverOnlyStaff, "NETWORK")).toBe(false);
    expect(() =>
      assertCanRequestDomain(serverOnlyStaff, "NETWORK"),
    ).toThrow(PermissionError);
  });
});
