import type { CurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";

export const STOCK_CONTROLLER_REQUIRED_TAG = "STOCK_CONTROLLER";
export const HEAD_STOCK_CONTROLLER_REQUIRED_TAG = "HEAD_STOCK_CONTROLLER";

export function domainStockControllerRequiredTag(domainCode: string) {
  return `${STOCK_CONTROLLER_REQUIRED_TAG}:${domainCode}`;
}

export function domainHeadStockControllerRequiredTag(domainCode: string) {
  return `${HEAD_STOCK_CONTROLLER_REQUIRED_TAG}:${domainCode}`;
}

export function isDomainStockControllerRequiredTag(requiredTag: string) {
  return requiredTag.startsWith(`${STOCK_CONTROLLER_REQUIRED_TAG}:`);
}

export function isDomainHeadStockControllerRequiredTag(requiredTag: string) {
  return requiredTag.startsWith(`${HEAD_STOCK_CONTROLLER_REQUIRED_TAG}:`);
}

function parseDomainControllerTag(requiredTag: string) {
  const [controllerTag, domainCode, ...rest] = requiredTag.split(":");

  if (rest.length > 0 || !domainCode) {
    return null;
  }

  if (
    controllerTag !== STOCK_CONTROLLER_REQUIRED_TAG &&
    controllerTag !== HEAD_STOCK_CONTROLLER_REQUIRED_TAG
  ) {
    return null;
  }

  return { controllerTag, domainCode };
}

export function approvalMatchesUser(
  user: CurrentUser,
  approval: { requiredTag: string; userId: string | null },
) {
  const domainController = parseDomainControllerTag(approval.requiredTag);

  if (domainController) {
    const hasDomainPermission = user.permissions.some((permission) => {
      if (permission.domainCode !== domainController.domainCode) {
        return false;
      }

      if (domainController.controllerTag === STOCK_CONTROLLER_REQUIRED_TAG) {
        return permission.canManage;
      }

      return approval.userId === user.id && (permission.canView || permission.canManage);
    });

    return (
      hasRole(user, "STOCK_CONTROLLER") &&
      user.stockControllerTag === domainController.controllerTag &&
      hasDomainPermission
    );
  }

  if (approval.userId === user.id) {
    return true;
  }

  return (
    user.organizationTag === approval.requiredTag ||
    user.projectTag === approval.requiredTag
  );
}
