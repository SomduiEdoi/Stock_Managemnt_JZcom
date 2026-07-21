import { AssetTrackMethod } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

export type SidebarDomain = {
  assetCount: number;
  code: string;
  controllerId: string | null;
  inventoryFamily: AssetTrackMethod;
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

const sidebarDomainSelect = {
  _count: { select: { assets: true } },
  code: true,
  inventoryFamily: true,
  name: true,
  permissions: {
    select: { userId: true },
    take: 1,
    where: { canManage: true },
  },
  prefix: true,
};

type SidebarDomainRecord = {
  _count: { assets: number };
  code: string;
  inventoryFamily: AssetTrackMethod;
  name: string;
  permissions: Array<{ userId: string }>;
  prefix: string;
};

async function ensureDomainViewPermissionsForActiveUsers(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  domainId: string,
  controllerId: string,
) {
  const existingPermissions = await tx.userDomainPermission.findMany({
    select: { userId: true },
    where: { domainId },
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

  await tx.userDomainPermission.createMany({
    data: usersMissingPermission.map((entry) => ({
      canManage: entry.id === controllerId,
      canView: true,
      domainId,
      userId: entry.id,
    })),
    skipDuplicates: true,
  });
}

function toSidebarDomain(domain: SidebarDomainRecord): SidebarDomain {
  return {
    assetCount: domain._count.assets,
    code: domain.code,
    controllerId: domain.permissions[0]?.userId ?? null,
    inventoryFamily: domain.inventoryFamily,
    name: domain.name,
    prefix: domain.prefix,
  };
}

export async function getSidebarDomainsForUser(user: CurrentUser) {
  if (hasRole(user, "ADMIN")) {
    const domains = await db.assetDomain.findMany({
      orderBy: { name: "asc" },
      select: sidebarDomainSelect,
      where: { isActive: true },
    });

    return domains.map(toSidebarDomain);
  }

  const visibleCodes = user.permissions
    .filter((permission) => permission.canView || permission.canManage)
    .map((permission) => permission.domainCode);

  if (visibleCodes.length === 0) {
    return [];
  }

  const domains = await db.assetDomain.findMany({
    orderBy: { name: "asc" },
    select: sidebarDomainSelect,
    where: { code: { in: visibleCodes }, isActive: true },
  });

  return domains.map(toSidebarDomain);
}

export async function getStockControllersForDomainForm() {
  return db.user.findMany({
    orderBy: { name: "asc" },
    select: { email: true, id: true, name: true },
    where: {
      isActive: true,
      roles: { some: { role: { code: "STOCK_CONTROLLER" } } },
    },
  });
}

export type CreateDomainInput = {
  controllerId: string;
  domainName: string;
  prefix: string;
  trackMethod: AssetTrackMethod;
};

export type UpdateDomainInput = {
  controllerId: string;
  domainName: string;
};

export async function createDomainForUser(user: CurrentUser, input: CreateDomainInput) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin can create domains.", 403, "FORBIDDEN");
  }

  const name = requireName(input.domainName, "Domain name");
  const prefix = requirePrefix(input.prefix);
  const code = normalizeCode(name);

  if (!input.controllerId) {
    throw new WorkflowError("Stock controller is required.");
  }

  return db.$transaction(async (tx) => {
    const controller = await tx.user.findFirst({
      select: { id: true },
      where: {
        id: input.controllerId,
        isActive: true,
        roles: { some: { role: { code: "STOCK_CONTROLLER" } } },
      },
    });

    if (!controller) {
      throw new WorkflowError("Stock controller not found.");
    }

    const duplicate = await tx.assetDomain.findFirst({
      select: { id: true },
      where: { OR: [{ code }, { prefix }, { name }] },
    });

    if (duplicate) {
      throw new WorkflowError("Domain name, code, or prefix already exists.", 409, "DUPLICATE_DOMAIN");
    }

    const domain = await tx.assetDomain.create({
      data: { code, inventoryFamily: input.trackMethod, name, prefix },
      select: { code: true, id: true, inventoryFamily: true, name: true, prefix: true },
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

    await tx.userDomainPermission.createMany({
      data: nonAdminUsers.map((entry) => ({
        canManage: entry.id === controller.id,
        canView: true,
        domainId: domain.id,
        userId: entry.id,
      })),
    });
    await ensureDomainViewPermissionsForActiveUsers(tx, domain.id, controller.id);

    return {
      assetCount: 0,
      code: domain.code,
      controllerId: controller.id,
      inventoryFamily: domain.inventoryFamily,
      name: domain.name,
      prefix: domain.prefix,
    };
  });
}

export async function updateDomainForUser(
  user: CurrentUser,
  domainCode: string,
  input: UpdateDomainInput,
) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin can edit domains.", 403, "FORBIDDEN");
  }

  const name = requireName(input.domainName, "Domain name");

  if (!input.controllerId) {
    throw new WorkflowError("Stock controller is required.");
  }

  return db.$transaction(async (tx) => {
    const domain = await tx.assetDomain.findFirst({
      select: { id: true },
      where: { code: domainCode, isActive: true },
    });

    if (!domain) {
      throw new WorkflowError("Domain not found.", 404);
    }

    const controller = await tx.user.findFirst({
      select: { id: true },
      where: {
        id: input.controllerId,
        isActive: true,
        roles: { some: { role: { code: "STOCK_CONTROLLER" } } },
      },
    });

    if (!controller) {
      throw new WorkflowError("Stock controller not found.");
    }

    const duplicate = await tx.assetDomain.findFirst({
      select: { id: true },
      where: {
        id: { not: domain.id },
        name,
      },
    });

    if (duplicate) {
      throw new WorkflowError("Domain name already exists.", 409, "DUPLICATE_DOMAIN");
    }

    await tx.assetDomain.update({
      data: { name },
      where: { id: domain.id },
    });

    await tx.userDomainPermission.updateMany({
      data: { canManage: false, canView: true },
      where: { domainId: domain.id },
    });
    await ensureDomainViewPermissionsForActiveUsers(tx, domain.id, controller.id);

    await tx.userDomainPermission.upsert({
      create: {
        canManage: true,
        canView: true,
        domainId: domain.id,
        userId: controller.id,
      },
      update: {
        canManage: true,
        canView: true,
      },
      where: {
        userId_domainId: {
          domainId: domain.id,
          userId: controller.id,
        },
      },
    });

    const updated = await tx.assetDomain.findUniqueOrThrow({
      select: sidebarDomainSelect,
      where: { id: domain.id },
    });

    return toSidebarDomain(updated);
  });
}

export async function deleteDomainForUser(user: CurrentUser, domainCode: string) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin can delete domains.", 403, "FORBIDDEN");
  }

  return db.$transaction(async (tx) => {
    const domain = await tx.assetDomain.findFirst({
      select: { id: true },
      where: { code: domainCode, isActive: true },
    });

    if (!domain) {
      throw new WorkflowError("Domain not found.", 404);
    }

    const assetCount = await tx.asset.count({
      where: { domainId: domain.id, isActive: true },
    });

    await tx.assetDomain.update({
      data: { isActive: false },
      where: { id: domain.id },
    });

    return { assetCount };
  });
}

