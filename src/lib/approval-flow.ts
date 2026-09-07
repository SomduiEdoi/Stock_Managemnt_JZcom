import type { CurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";

export const STOCK_CONTROLLER_REQUIRED_TAG = "STOCK_CONTROLLER";
export const HEAD_STOCK_CONTROLLER_REQUIRED_TAG = "HEAD_STOCK_CONTROLLER";

export function warehouseStockControllerRequiredTag(warehouseCode: string) {
  return `${STOCK_CONTROLLER_REQUIRED_TAG}:${warehouseCode}`;
}

export function warehouseHeadStockControllerRequiredTag(warehouseCode: string) {
  return `${HEAD_STOCK_CONTROLLER_REQUIRED_TAG}:${warehouseCode}`;
}

export function isWarehouseStockControllerRequiredTag(requiredTag: string) {
  return requiredTag.startsWith(`${STOCK_CONTROLLER_REQUIRED_TAG}:`);
}

export function isWarehouseHeadStockControllerRequiredTag(requiredTag: string) {
  return requiredTag.startsWith(`${HEAD_STOCK_CONTROLLER_REQUIRED_TAG}:`);
}

function parseWarehouseControllerTag(requiredTag: string) {
  const [controllerTag, warehouseCode, ...rest] = requiredTag.split(":");

  if (rest.length > 0 || !warehouseCode) {
    return null;
  }

  if (
    controllerTag !== STOCK_CONTROLLER_REQUIRED_TAG &&
    controllerTag !== HEAD_STOCK_CONTROLLER_REQUIRED_TAG
  ) {
    return null;
  }

  return { controllerTag, warehouseCode };
}

export function approvalMatchesUser(
  user: CurrentUser,
  approval: { requiredTag: string; userId: string | null },
) {
  const warehouseController = parseWarehouseControllerTag(approval.requiredTag);

  if (warehouseController) {
    const hasWarehousePermission = user.permissions.some((permission) => {
      if (permission.warehouseCode !== warehouseController.warehouseCode) {
        return false;
      }

      if (warehouseController.controllerTag === STOCK_CONTROLLER_REQUIRED_TAG) {
        return permission.canManage;
      }

      return approval.userId === user.id && (permission.canView || permission.canManage);
    });

    return hasRole(user, "STOCK_CONTROLLER") && hasWarehousePermission;
  }

  if (approval.userId === user.id) {
    return true;
  }

  return (
    user.organizationTag === approval.requiredTag ||
    user.organizationAssignments.some(
      (assignment) => assignment.organizationTag === approval.requiredTag,
    ) ||
    user.projectTag === approval.requiredTag
  );
}
