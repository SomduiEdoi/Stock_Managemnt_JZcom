import { AssetTrackMethod } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

export type SidebarDomain = {
  code: string;
  name: string;
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

function requireTypeCode(value: string | null | undefined) {
  const text = cleanText(value)?.toUpperCase();

  if (!text) {
    return null;
  }

  if (!/^[A-Z0-9]{2}$/.test(text)) {
    throw new WorkflowError("Type prefix must be exactly 2 English letters or numbers.");
  }

  return text;
}

export async function getSidebarDomainsForUser(user: CurrentUser) {
  if (hasRole(user, "ADMIN")) {
    return db.assetDomain.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
      where: { isActive: true },
    });
  }

  const visibleCodes = user.permissions
    .filter((permission) => permission.canView || permission.canManage)
    .map((permission) => permission.domainCode);

  if (visibleCodes.length === 0) {
    return [];
  }

  return db.assetDomain.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true },
    where: { code: { in: visibleCodes }, isActive: true },
  });
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
  categoryName: string;
  controllerId: string;
  domainName: string;
  prefix: string;
  trackMethod: AssetTrackMethod;
  typeCode?: string | null;
  typeName: string;
};

export async function createDomainForUser(user: CurrentUser, input: CreateDomainInput) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin can create domains.", 403, "FORBIDDEN");
  }

  const name = requireName(input.domainName, "Domain name");
  const prefix = requirePrefix(input.prefix);
  const code = normalizeCode(name);
  const categoryName = requireName(input.categoryName, "Category");
  const typeName = requireName(input.typeName, "Type");
  const typeCode = requireTypeCode(input.typeCode) ?? typeName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(2, "X").slice(0, 2);

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
      data: { code, name, prefix },
      select: { code: true, id: true, name: true },
    });

    const category = await tx.assetCategory.create({
      data: { domainId: domain.id, name: categoryName },
      select: { id: true },
    });

    await tx.assetType.create({
      data: {
        categoryId: category.id,
        code: typeCode,
        name: typeName,
        trackMethod: input.trackMethod,
      },
    });

    await tx.userDomainPermission.create({
      data: {
        canManage: true,
        canView: true,
        domainId: domain.id,
        userId: controller.id,
      },
    });

    return domain;
  });
}
