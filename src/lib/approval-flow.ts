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
  if (approval.userId === user.id) {
    return true;
  }

  const domainController = parseDomainControllerTag(approval.requiredTag);

  if (domainController) {
    return (
      hasRole(user, "STOCK_CONTROLLER") &&
      user.stockControllerTag === domainController.controllerTag &&
      user.permissions.some(
        (permission) =>
          permission.domainCode === domainController.domainCode &&
          permission.canManage,
      )
    );
  }

  return (
    user.organizationTag === approval.requiredTag ||
    user.projectTag === approval.requiredTag
  );
}
