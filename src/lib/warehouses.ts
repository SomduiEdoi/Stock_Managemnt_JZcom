import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

export type SidebarWarehouse = {
  assetCount: number;
  code: string;
  controllerId: string | null;
  headControllerId: string | null;
  headControllerIds: string[];
  name: string;
  prefix: string;
};

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCode(value: string) {
  return value.trim().replace(/[^A-Za-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toUpperCase();
}

function assertAscii(value: string, label: string) {
  if (/[^\x00-\x7F]/.test(value)) {
    throw new WorkflowError(`${label} must use English letters, numbers, or allowed symbols only.`);
  }
}

function requireName(value: string | null | undefined, label: string) {
  const text = cleanText(value);

  if (!text) {
    throw new WorkflowError(`${label} is required.`);
  }

  assertAscii(text, label);

  if (text.length < 2 || text.length > 40) {
    throw new WorkflowError(`${label} must be 2-40 characters.`);
  }

  return text;
}

function requirePrefix(value: string | null | undefined) {
  const text = cleanText(value)?.toUpperCase();

  if (!text) {
    throw new WorkflowError("Prefix is required.");
  }

  if (!/^[A-Z0-9]{2}$/.test(text)) {
    throw new WorkflowError("Prefix must be exactly 2 English letters or numbers.");
  }

  return text;
}

const sidebarWarehouseSelect = {
  _count: { select: { assets: { where: { isActive: true } } } },
  code: true,
  headStockControllerId: true,
  name: true,
  permissions: {
    orderBy: { createdAt: "asc" as const },
    select: {
      canManage: true,
      canView: true,
      userId: true,
    },
    where: { OR: [{ canManage: true }, { canView: true }] },
  },
  managerAssignments: {
    orderBy: { createdAt: "asc" as const },
    select: { userId: true },
  },
  prefix: true,
};

type SidebarWarehouseRecord = {
  _count: { assets: number };
  code: string;
  headStockControllerId: string | null;
  name: string;
  permissions: Array<{
    canManage: boolean;
    canView: boolean;
    userId: string;
  }>;
  managerAssignments: Array<{ userId: string }>;
  prefix: string;
};

type WarehouseTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function ensureWarehouseViewPermissionsForActiveUsers(
  tx: WarehouseTx,
  warehouseId: string,
  managerIds: string[],
) {
  const managerIdSet = new Set(managerIds.filter(Boolean));
  const existingPermissions = await tx.userWarehousePermission.findMany({
    select: { userId: true },
    where: { warehouseId },
  });
  const existingUserIds = new Set(
    existingPermissions.map((permission) => permission.userId),
  );
  const usersMissingPermission = await tx.user.findMany({
    select: { id: true },
    where: {
      id: { notIn: [...existingUserIds] },
      isActive: true,
      roles: {
        none: {
          role: { code: "ADMIN" },
        },
      },
    },
  });

  if (usersMissingPermission.length === 0) {
    return;
  }

  await tx.userWarehousePermission.createMany({
    data: usersMissingPermission.map((entry) => ({
      canManage: managerIdSet.has(entry.id),
      canView: true,
      warehouseId,
      userId: entry.id,
    })),
    skipDuplicates: true,
  });
}

async function findStockControllerOrThrow(
  tx: WarehouseTx,
  userId: string,
  label: string,
) {
  const controller = await tx.user.findFirst({
    select: { id: true },
    where: {
      id: userId,
      isActive: true,
      roles: { some: { role: { code: "STOREMAN" } } },
    },
  });

  if (!controller) {
    throw new WorkflowError(`${label} must be an active user with the Storeman role.`, 422, "INVALID_STOREMAN");
  }

  return controller;
}

async function findWarehouseManagerOrThrow(
  tx: WarehouseTx,
  userId: string,
  label: string,
) {
  const manager = await tx.user.findFirst({
    select: { id: true },
    where: {
      id: userId,
      isActive: true,
      OR: [
        { organizationTag: "WAREHOUSE_MANAGER" },
        { organizationAssignments: { some: { isActive: true, organizationTag: "WAREHOUSE_MANAGER" } } },
        { headControlledWarehouses: { some: { isActive: true } } },
      ],
    },
  });

  if (!manager) {
    throw new WorkflowError(`${label} must have the Warehouse Manager tag.`);
  }

  return manager;
}

async function assertStockControllerManageSlot(
  tx: WarehouseTx,
  userId: string,
  warehouseId?: string,
) {
  const existingManagedWarehouse = await tx.userWarehousePermission.findFirst({
    select: { warehouse: { select: { name: true } } },
    where: {
      canManage: true,
      warehouse: { isActive: true, ...(warehouseId ? { id: { not: warehouseId } } : {}) },
      userId,
    },
  });

  if (existingManagedWarehouse) {
    throw new WorkflowError(
      `This stock controller already manages ${existingManagedWarehouse.warehouse.name}.`,
      409,
      "STOCK_CONTROLLER_ALREADY_MANAGES_WAREHOUSE",
    );
  }
}

async function upsertWarehousePermission(
  tx: WarehouseTx,
  warehouseId: string,
  userId: string,
  canManage: boolean,
) {
  await tx.userWarehousePermission.upsert({
    create: {
      canManage,
      canView: true,
      warehouseId,
      userId,
    },
    update: {
      canManage,
      canView: true,
    },
    where: {
      userId_warehouseId: {
        warehouseId,
        userId,
      },
    },
  });
}

function toSidebarWarehouse(warehouse: SidebarWarehouseRecord): SidebarWarehouse {
  const headControllerIds = warehouse.managerAssignments.map((assignment) => assignment.userId);

  const controllerId = warehouse.permissions.find((permission) => permission.canManage)?.userId ?? null;

  return {
    assetCount: warehouse._count.assets,
    code: warehouse.code,
    controllerId,
    headControllerId: headControllerIds[0] ?? null,
    headControllerIds,
    name: warehouse.name,
    prefix: warehouse.prefix,
  };
}

export async function getSidebarWarehousesForUser() {
  const warehouses = await db.assetWarehouse.findMany({
    orderBy: { name: "asc" },
    select: sidebarWarehouseSelect,
    where: { isActive: true },
  });

  return warehouses.map(toSidebarWarehouse);
}

export async function getStockControllersForWarehouseForm() {
  const users = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { email: true, id: true, name: true, position: true, roles: { select: { role: { select: { code: true } } } } },
    where: {
      isActive: true,
      OR: [
        { roles: { some: { role: { code: "STOREMAN" } } } },
        { organizationTag: "WAREHOUSE_MANAGER" },
        { organizationAssignments: { some: { isActive: true, organizationTag: "WAREHOUSE_MANAGER" } } },
        { headControlledWarehouses: { some: { isActive: true } } },
      ],
    },
  });

  return users.map(({ roles, ...user }) => ({ ...user, email: user.email ?? "Not Linked", isStoreman: roles.some(({ role }) => role.code === "STOREMAN") }));
}

export type CreateWarehouseInput = {
  controllerId: string;
  warehouseName: string;
  headControllerId?: string | null;
  headControllerIds?: string[];
  prefix: string;
};

export type UpdateWarehouseInput = {
  controllerId: string;
  warehouseName: string;
  headControllerId?: string | null;
  headControllerIds?: string[];
};

function uniqueControllerIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function createWarehouseForUser(user: CurrentUser, input: CreateWarehouseInput) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin can create warehouses.", 403, "FORBIDDEN");
  }

  const name = requireName(input.warehouseName, "Warehouse name");
  const prefix = requirePrefix(input.prefix);
  const code = normalizeCode(name);

  if (!input.controllerId) {
    throw new WorkflowError("Stock controller is required.");
  }

  return db.$transaction(async (tx) => {
    const controller = await findStockControllerOrThrow(
      tx,
      input.controllerId,
      "Stock controller",
    );
    await assertStockControllerManageSlot(tx, controller.id);
    const headControllerIds = uniqueControllerIds([...(input.headControllerIds ?? []), input.headControllerId]);
    const headControllers = await Promise.all(
      headControllerIds.map((id) =>
        findWarehouseManagerOrThrow(tx, id, "Warehouse Manager"),
      ),
    );
    const managerIds = uniqueControllerIds([controller.id]);

    const duplicate = await tx.assetWarehouse.findFirst({
      select: { id: true },
      where: { OR: [{ code }, { prefix }, { name }] },
    });

    if (duplicate) {
      throw new WorkflowError("Warehouse name, code, or prefix already exists.", 409, "DUPLICATE_WAREHOUSE");
    }

    const warehouse = await tx.assetWarehouse.create({
      data: {
        code,
        headStockControllerId: headControllers[0]?.id ?? null,
        name,
        prefix,
      },
      select: {
        code: true,
        headStockControllerId: true,
        id: true,
        name: true,
        prefix: true,
      },
    });

    await tx.warehouseManagerAssignment.createMany({
      data: headControllers.map((manager) => ({
        userId: manager.id,
        warehouseId: warehouse.id,
      })),
      skipDuplicates: true,
    });

    const nonAdminUsers = await tx.user.findMany({
      select: { id: true },
      where: {
        isActive: true,
        roles: {
          none: {
            role: { code: "ADMIN" },
          },
        },
      },
    });

    await tx.userWarehousePermission.createMany({
      data: nonAdminUsers.map((entry) => ({
        canManage: managerIds.includes(entry.id),
        canView: true,
        warehouseId: warehouse.id,
        userId: entry.id,
      })),
    });
    await ensureWarehouseViewPermissionsForActiveUsers(tx, warehouse.id, [
      ...managerIds,
    ]);
    await upsertWarehousePermission(tx, warehouse.id, controller.id, true);
    for (const headController of headControllers) {
      await upsertWarehousePermission(
        tx,
        warehouse.id,
        headController.id,
        headController.id === controller.id,
      );
    }

    return {
      assetCount: 0,
      code: warehouse.code,
      controllerId: controller.id,
      headControllerId: headControllers[0]?.id ?? null,
      headControllerIds: headControllers.map((entry) => entry.id),
      name: warehouse.name,
      prefix: warehouse.prefix,
    };
  });
}

export async function updateWarehouseForUser(
  user: CurrentUser,
  warehouseCode: string,
  input: UpdateWarehouseInput,
) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin can edit warehouses.", 403, "FORBIDDEN");
  }

  const name = requireName(input.warehouseName, "Warehouse name");

  if (!input.controllerId) {
    throw new WorkflowError("Stock controller is required.");
  }

  return db.$transaction(async (tx) => {
    const warehouse = await tx.assetWarehouse.findFirst({
      select: { id: true },
      where: { code: warehouseCode, isActive: true },
    });

    if (!warehouse) {
      throw new WorkflowError("Warehouse not found.", 404);
    }

    const controller = await findStockControllerOrThrow(
      tx,
      input.controllerId,
      "Stock controller",
    );
    await assertStockControllerManageSlot(tx, controller.id, warehouse.id);
    const headControllerIds = uniqueControllerIds([...(input.headControllerIds ?? []), input.headControllerId]);
    const headControllers = await Promise.all(
      headControllerIds.map((id) =>
        findWarehouseManagerOrThrow(tx, id, "Warehouse Manager"),
      ),
    );
    const managerIds = uniqueControllerIds([controller.id]);

    const duplicate = await tx.assetWarehouse.findFirst({
      select: { id: true },
      where: {
        id: { not: warehouse.id },
        OR: [{ name }],
      },
    });

    if (duplicate) {
      throw new WorkflowError("Warehouse name already exists.", 409, "DUPLICATE_WAREHOUSE");
    }

    await tx.assetWarehouse.update({
      data: {
        headStockControllerId: headControllers[0]?.id ?? null,
        name,
      },
      where: { id: warehouse.id },
    });

    await tx.warehouseManagerAssignment.deleteMany({ where: { warehouseId: warehouse.id } });
    await tx.warehouseManagerAssignment.createMany({
      data: headControllers.map((manager) => ({
        userId: manager.id,
        warehouseId: warehouse.id,
      })),
      skipDuplicates: true,
    });

    await tx.userWarehousePermission.updateMany({
      data: { canManage: false, canView: true },
      where: { warehouseId: warehouse.id },
    });
    await ensureWarehouseViewPermissionsForActiveUsers(tx, warehouse.id, [
      ...managerIds,
    ]);
    await upsertWarehousePermission(tx, warehouse.id, controller.id, true);
    for (const headController of headControllers) {
      await upsertWarehousePermission(
        tx,
        warehouse.id,
        headController.id,
        headController.id === controller.id,
      );
    }

    const updated = await tx.assetWarehouse.findUniqueOrThrow({
      select: sidebarWarehouseSelect,
      where: { id: warehouse.id },
    });

    return toSidebarWarehouse(updated);
  });
}

export async function deleteWarehouseForUser(user: CurrentUser, warehouseCode: string) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin can delete warehouses.", 403, "FORBIDDEN");
  }

  return db.$transaction(async (tx) => {
    const warehouse = await tx.assetWarehouse.findFirst({
      select: { id: true },
      where: { code: warehouseCode, isActive: true },
    });

    if (!warehouse) {
      throw new WorkflowError("Warehouse not found.", 404);
    }

    const assetCount = await tx.asset.count({
      where: { warehouseId: warehouse.id, isActive: true },
    });

    if (assetCount > 0) {
      throw new WorkflowError(
        `This warehouse currently contains ${assetCount.toLocaleString("en-US")} assets. Please delete all assets in this warehouse before deleting the warehouse.`,
        409,
        "WAREHOUSE_HAS_ASSETS",
      );
    }

    await tx.assetWarehouse.update({
      data: { isActive: false },
      where: { id: warehouse.id },
    });

    return { assetCount };
  });
}
