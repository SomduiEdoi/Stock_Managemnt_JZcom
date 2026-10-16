import { describe, expect, it } from "vitest";
import {
  PermissionError,
  assertCanRequestWarehouse,
  canChangeAssetStatusForUser,
  canDeleteAssetsForUser,
  canRequestAssetsForUser,
  canRequestWarehouseForUser,
  assertCanManageWarehouse,
  canManageWarehouse,
  canManageWarehouseForUser,
  canViewWarehouse,
  canViewWarehouseForUser,
  type WarehousePermission,
  type PermissionUser,
} from "./permissions";

const permissions: WarehousePermission[] = [
  { warehouseCode: "SERVER", canView: true, canManage: true },
  { warehouseCode: "NETWORK", canView: true, canManage: false },
];

describe("warehouse permissions", () => {
  it("allows managing only warehouses with canManage", () => {
    expect(canManageWarehouse(permissions, "SERVER")).toBe(true);
    expect(canManageWarehouse(permissions, "NETWORK")).toBe(false);
  });

  it("allows read-only access when canView is true", () => {
    expect(canViewWarehouse(permissions, "SERVER")).toBe(true);
    expect(canViewWarehouse(permissions, "NETWORK")).toBe(true);
  });

  it("lets admin manage all warehouses", () => {
    const admin: PermissionUser = {
      roles: ["ADMIN"],
      permissions: [],
    };

    expect(canManageWarehouseForUser(admin, "SERVER")).toBe(true);
    expect(canManageWarehouseForUser(admin, "NETWORK")).toBe(true);
  });

  it("keeps users read-only", () => {
    const staff: PermissionUser = {
      roles: ["USER"],
      permissions: [
        { warehouseCode: "SERVER", canView: true, canManage: false },
        { warehouseCode: "NETWORK", canView: true, canManage: false },
      ],
    };

    expect(canViewWarehouseForUser(staff, "SERVER")).toBe(true);
    expect(canRequestWarehouseForUser(staff, "SERVER")).toBe(true);
    expect(canManageWarehouseForUser(staff, "SERVER")).toBe(false);
  });

  it("throws for forbidden manage actions", () => {
    const arm: PermissionUser = {
      roles: ["STOREMAN"],
      permissions,
    };

    expect(() => assertCanManageWarehouse(arm, "NETWORK")).toThrow(
      PermissionError,
    );
  });

  it("keeps stock controllers out of request flow while allowing managed-warehouse actions", () => {
    const arm: PermissionUser = {
      roles: ["STOREMAN"],
      permissions,
    };

    expect(canRequestWarehouseForUser(arm, "SERVER")).toBe(false);
    expect(canRequestWarehouseForUser(arm, "NETWORK")).toBe(false);
    expect(canDeleteAssetsForUser(arm, "SERVER")).toBe(true);
    expect(canChangeAssetStatusForUser(arm, "SERVER")).toBe(true);
    expect(canDeleteAssetsForUser(arm, "NETWORK")).toBe(false);
    expect(canManageWarehouseForUser(arm, "NETWORK")).toBe(false);
  });

  it("keeps users with warehouse-management access out of request flow", () => {
    const managedUser: PermissionUser = {
      roles: ["USER"],
      permissions: [
        { warehouseCode: "SERVER", canView: true, canManage: true },
        { warehouseCode: "NETWORK", canView: true, canManage: false },
      ],
    };

    expect(canRequestWarehouseForUser(managedUser, "SERVER")).toBe(false);
    expect(canRequestWarehouseForUser(managedUser, "NETWORK")).toBe(false);
    expect(canRequestAssetsForUser(managedUser)).toBe(false);
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

  it("blocks requests when a user cannot view the warehouse", () => {
    const serverOnlyStaff: PermissionUser = {
      roles: ["USER"],
      permissions: [{ warehouseCode: "SERVER", canView: true, canManage: false }],
    };

    expect(canRequestAssetsForUser(serverOnlyStaff)).toBe(true);
    expect(canRequestWarehouseForUser(serverOnlyStaff, "NETWORK")).toBe(false);
    expect(() =>
      assertCanRequestWarehouse(serverOnlyStaff, "NETWORK"),
    ).toThrow(PermissionError);
  });
});
