export type DomainCode = "SERVER" | "NETWORK";

export type DomainPermission = {
  domainCode: DomainCode;
  canView: boolean;
  canManage: boolean;
};

export function canManageDomain(
  permissions: DomainPermission[],
  domainCode: DomainCode,
) {
  return permissions.some(
    (permission) =>
      permission.domainCode === domainCode && permission.canManage,
  );
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

