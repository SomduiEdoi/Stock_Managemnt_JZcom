import { describe, expect, it } from "vitest";
import { canManageDomain, canViewDomain, type DomainPermission } from "./permissions";

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
});

