import type { CurrentUser } from "@/lib/auth";
import { organizationPosition } from "@/lib/organization-matrix";

export const STOREMAN_REQUIRED_TAG = "STOREMAN";
export const WAREHOUSE_MANAGER_REQUIRED_TAG = "WAREHOUSE_MANAGER";
export const ACK_BSD_REQUIRED_TAG = "ACK_BSD";
export const ACK_WAREHOUSE_MANAGER_REQUIRED_TAG = "ACK_WAREHOUSE_MANAGER";

export function requiresRequesterSupervisorApproval(type: string, serviceRequest?: boolean) {
  return type === "USING" || type === "SOLD" || type === "BORROW" || Boolean(serviceRequest);
}

export function supervisorTagsForOrganizationTags(tags: Array<string | null | undefined>) {
  return [...new Set(tags.flatMap((tag) => {
    const next = tag ? organizationPosition(tag)?.nextApproverRole : null;
    return next ? [next] : [];
  }))];
}

export function warehouseStockControllerRequiredTag(warehouseCode: string) {
  return `${STOREMAN_REQUIRED_TAG}:${warehouseCode}`;
}

export function warehouseHeadStockControllerRequiredTag(warehouseCode: string) {
  return `${WAREHOUSE_MANAGER_REQUIRED_TAG}:${warehouseCode}`;
}

export function isWarehouseStockControllerRequiredTag(requiredTag: string) {
  return requiredTag.startsWith(`${STOREMAN_REQUIRED_TAG}:`);
}

export function isWarehouseHeadStockControllerRequiredTag(requiredTag: string) {
  return requiredTag.startsWith(`${WAREHOUSE_MANAGER_REQUIRED_TAG}:`);
}

function parseWarehouseControllerTag(requiredTag: string) {
  const [controllerTag, warehouseCode, ...rest] = requiredTag.split(":");

  if (rest.length > 0 || !warehouseCode) {
    return null;
  }

  if (
    controllerTag !== STOREMAN_REQUIRED_TAG &&
    controllerTag !== WAREHOUSE_MANAGER_REQUIRED_TAG &&
    controllerTag !== "RETURN_CHECK"
  ) {
    return null;
  }

  return { controllerTag, warehouseCode };
}

export function approvalMatchesWarehouse(requiredTag: string, warehouseCode: string) {
  const warehouseController = parseWarehouseControllerTag(requiredTag);
  const hasWarehouseControllerPrefix =
    requiredTag.startsWith(`${STOREMAN_REQUIRED_TAG}:`) ||
    requiredTag.startsWith(`${WAREHOUSE_MANAGER_REQUIRED_TAG}:`) ||
    requiredTag.startsWith("RETURN_CHECK:");

  return !hasWarehouseControllerPrefix || warehouseController?.warehouseCode === warehouseCode;
}

export function approvalMatchesUser(
  user: CurrentUser,
  approval: { requiredTag: string; userId: string | null },
) {
  // Approval rows are assigned to concrete users. A shared role or warehouse
  // permission must not let one person approve another person's row.
  if (approval.userId && approval.userId !== user.id) {
    return false;
  }

  const warehouseController = parseWarehouseControllerTag(approval.requiredTag);
  const hasWarehouseControllerPrefix =
    approval.requiredTag.startsWith(`${STOREMAN_REQUIRED_TAG}:`) ||
    approval.requiredTag.startsWith(`${WAREHOUSE_MANAGER_REQUIRED_TAG}:`) ||
    approval.requiredTag.startsWith("RETURN_CHECK:");

  if (hasWarehouseControllerPrefix && !warehouseController) {
    return false;
  }

  if (warehouseController) {
    const hasWarehousePermission = user.permissions.some((permission) => {
      if (permission.warehouseCode !== warehouseController.warehouseCode) {
        return false;
      }

      if (warehouseController.controllerTag === STOREMAN_REQUIRED_TAG || warehouseController.controllerTag === "RETURN_CHECK") {
        return permission.canManage;
      }

      return approval.userId === user.id && (permission.canView || permission.canManage);
    });

    return hasWarehousePermission;
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
