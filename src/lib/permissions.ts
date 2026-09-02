import type { RoleCode as PrismaRoleCode } from "@prisma/client";

export type WarehouseCode = string;
export type RoleCode = PrismaRoleCode;

export const warehouseCodes = ["SERVER", "NETWORK"] as const;
export const requestRoleCodes = ["USER"] as const satisfies readonly RoleCode[];

export type WarehousePermission = {
  warehouseCode: WarehouseCode;
  canView: boolean;
  canManage: boolean;
};

export type PermissionUser = {
  roles: RoleCode[];
  permissions: WarehousePermission[];
  stockControllerTag?: string | null;
};

export class PermissionError extends Error {
  statusCode = 403;

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "PermissionError";
  }
}

export function hasRole(user: PermissionUser, roleCode: RoleCode) {
  return user.roles.includes(roleCode);
}

export function isHeadStockController(user: PermissionUser) {
  return user.stockControllerTag === "HEAD_STOCK_CONTROLLER";
}

export function hasAnyRole(
  user: PermissionUser,
  roleCodes: readonly RoleCode[],
) {
  return user.roles.some((roleCode) => roleCodes.includes(roleCode));
}

export function canManageWarehouse(
  permissions: WarehousePermission[],
  warehouseCode: WarehouseCode,
) {
  return permissions.some(
    (permission) =>
      permission.warehouseCode === warehouseCode && permission.canManage,
  );
}

export function canManageWarehouseForUser(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  return hasRole(user, "ADMIN") || canManageWarehouse(user.permissions, warehouseCode);
}

export function canViewWarehouseForUser(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  return hasRole(user, "ADMIN") || canViewWarehouse(user.permissions, warehouseCode);
}

export function canRequestWarehouseForUser(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  return (
    hasAnyRole(user, requestRoleCodes) &&
    canViewWarehouseForUser(user, warehouseCode)
  );
}

export function canRequestAssetsForUser(user: PermissionUser) {
  return user.permissions.some((permission) =>
    canRequestWarehouseForUser(user, permission.warehouseCode),
  );
}

export function canDeleteAssetsForUser(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  return canManageWarehouseForUser(user, warehouseCode);
}

export function canChangeAssetStatusForUser(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  return canManageWarehouseForUser(user, warehouseCode);
}

export function assertCanManageWarehouse(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  if (!canManageWarehouseForUser(user, warehouseCode)) {
    throw new PermissionError(`Cannot manage ${warehouseCode} assets.`);
  }
}

export function assertCanViewWarehouse(user: PermissionUser, warehouseCode: WarehouseCode) {
  if (!canViewWarehouseForUser(user, warehouseCode)) {
    throw new PermissionError(`Cannot view ${warehouseCode} assets.`);
  }
}

export function assertCanRequestWarehouse(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  if (!canRequestWarehouseForUser(user, warehouseCode)) {
    throw new PermissionError(`Cannot request ${warehouseCode} assets.`);
  }
}

export function assertCanDeleteAssets(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  if (!canDeleteAssetsForUser(user, warehouseCode)) {
    throw new PermissionError(`Cannot delete ${warehouseCode} assets.`);
  }
}

export function assertCanChangeAssetStatus(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
) {
  if (!canChangeAssetStatusForUser(user, warehouseCode)) {
    throw new PermissionError(`Cannot change ${warehouseCode} asset status.`);
  }
}

export function canViewWarehouse(
  permissions: WarehousePermission[],
  warehouseCode: WarehouseCode,
) {
  return permissions.some(
    (permission) =>
      permission.warehouseCode === warehouseCode &&
      (permission.canView || permission.canManage),
  );
}
