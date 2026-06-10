export type DomainCode = "SERVER" | "NETWORK";
export type RoleCode = "ADMIN" | "STOCK_OWNER" | "VIEWER";

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
