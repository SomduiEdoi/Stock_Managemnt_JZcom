import type { RoleCode as PrismaRoleCode } from "@prisma/client";

export type DomainCode = string;
export type RoleCode = PrismaRoleCode;

export const domainCodes = ["SERVER", "NETWORK"] as const;
export const requestRoleCodes = ["USER"] as const satisfies readonly RoleCode[];

export type DomainPermission = {
  domainCode: DomainCode;
  canView: boolean;
  canManage: boolean;
};

export type PermissionUser = {
  roles: RoleCode[];
  permissions: DomainPermission[];
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

export function hasAnyRole(
  user: PermissionUser,
  roleCodes: readonly RoleCode[],
) {
  return user.roles.some((roleCode) => roleCodes.includes(roleCode));
}

export function canManageDomain(
  permissions: DomainPermission[],
  domainCode: DomainCode,
) {
  return permissions.some(
    (permission) =>
      permission.domainCode === domainCode && permission.canManage,
  );
}

export function canManageDomainForUser(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  return hasRole(user, "ADMIN") || canManageDomain(user.permissions, domainCode);
}

export function canViewDomainForUser(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  return hasRole(user, "ADMIN") || canViewDomain(user.permissions, domainCode);
}

export function canRequestDomainForUser(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  return (
    hasAnyRole(user, requestRoleCodes) &&
    canViewDomainForUser(user, domainCode)
  );
}

export function canRequestAssetsForUser(user: PermissionUser) {
  return domainCodes.some((domainCode) =>
    canRequestDomainForUser(user, domainCode),
  );
}

export function canDeleteAssetsForUser(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  return canManageDomainForUser(user, domainCode);
}

export function canChangeAssetStatusForUser(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  return canManageDomainForUser(user, domainCode);
}

export function assertCanManageDomain(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  if (!canManageDomainForUser(user, domainCode)) {
    throw new PermissionError(`Cannot manage ${domainCode} assets.`);
  }
}

export function assertCanViewDomain(user: PermissionUser, domainCode: DomainCode) {
  if (!canViewDomainForUser(user, domainCode)) {
    throw new PermissionError(`Cannot view ${domainCode} assets.`);
  }
}

export function assertCanRequestDomain(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  if (!canRequestDomainForUser(user, domainCode)) {
    throw new PermissionError(`Cannot request ${domainCode} assets.`);
  }
}

export function assertCanDeleteAssets(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  if (!canDeleteAssetsForUser(user, domainCode)) {
    throw new PermissionError(`Cannot delete ${domainCode} assets.`);
  }
}

export function assertCanChangeAssetStatus(
  user: PermissionUser,
  domainCode: DomainCode,
) {
  if (!canChangeAssetStatusForUser(user, domainCode)) {
    throw new PermissionError(`Cannot change ${domainCode} asset status.`);
  }
}

export function canViewDomain(
  permissions: DomainPermission[],
  domainCode: DomainCode,
) {
  return permissions.some(
    (permission) =>
      permission.domainCode === domainCode &&
      (permission.canView || permission.canManage),
  );
}
