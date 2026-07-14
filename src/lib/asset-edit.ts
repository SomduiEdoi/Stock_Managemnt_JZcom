import {
  AssetActionType,
  AssetTrackMethod,
  AssetStatus,
  Prisma,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assertCanDeleteAssets,
  assertCanManageDomain,
  canManageDomainForUser,
  hasRole,
} from "@/lib/permissions";
import { canTransitionAssetStatus, getManualStatusAction } from "@/lib/workflow-rules";
import { WorkflowError } from "@/lib/workflow";

const assetEditSelect = Prisma.validator<Prisma.AssetSelect>()({
  assetNo: true,
  assetQuantity: true,
  assetModel: {
    select: {
      brand: true,
      category: { select: { id: true, name: true } },
      description: true,
      domain: { select: { code: true, id: true, inventoryFamily: true, name: true } },
      id: true,
      modelNo: true,
      name: true,
      partNo: true,
      typeName: true,
    },
  },
  domain: { select: { code: true, id: true, inventoryFamily: true, name: true } },
  id: true,
  imageRef: true,
  isActive: true,
  legacyFg: true,
  legacyQty: true,
  location: { select: { code: true, id: true, name: true } },
  locationText: true,
  note: true,
  requestLockedAt: true,
  requestLockedBy: { select: { email: true, id: true, name: true } },
  serialNo: true,
  sourceRecordId: true,
  sourceSystem: true,
  status: true,
  stockCode: true,
  updatedAt: true,
});

export type AssetEditRecord = Prisma.AssetGetPayload<{
  select: typeof assetEditSelect;
}>;

export type AssetEditOptions = {
  categories: Array<{ domainCode: string; name: string }>;
  domains: Array<{ code: string; inventoryFamily: AssetTrackMethod; name: string }>;
  locations: Array<{ code: string | null; name: string }>;
  statuses: AssetStatus[];
  types: Array<{ categoryName: string; code: string | null; domainCode: string; name: string; trackMethod: AssetTrackMethod }>;
};

export type AssetEditResult =
  | {
      asset: AssetEditRecord;
      canChangeDomain: boolean;
      kind: "ok";
      options: AssetEditOptions;
    }
  | { kind: "forbidden" }
  | { kind: "notFound" };

export type AssetCreateResult =
  | {
      canChangeDomain: boolean;
      initialDomainCode: string;
      kind: "ok";
      options: AssetEditOptions;
    }
  | { kind: "forbidden" };

export type UpdateAssetInput = {
  assetNo?: string | null;
  brand?: string | null;
  categoryName?: string | null;
  description?: string | null;
  domainCode: string;
  imageRef?: string | null;
  isActive?: boolean;
  legacyFg?: number | null;
  legacyQty?: number | null;
  locationCode?: string | null;
  locationName?: string | null;
  locationText?: string | null;
  modelName: string;
  modelNo?: string | null;
  note?: string | null;
  partNo?: string | null;
  serialNo?: string | null;
  sourceRecordId?: string | null;
  sourceSystem?: string | null;
  status: AssetStatus;
  stockCode?: string | null;
  quantity?: number | null;
  typeName?: string | null;
};

export type CreateAssetInput = UpdateAssetInput;

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireText(value: string | null | undefined, label: string) {
  const trimmed = cleanText(value);

  if (!trimmed) {
    throw new WorkflowError(`${label} is required.`);
  }

  return trimmed;
}


function assertAscii(value: string, label: string) {
  if (/[^\x00-\x7F]/.test(value)) {
    throw new WorkflowError(`${label} must use English letters, numbers, or allowed symbols only.`);
  }
}

function requirePatternText(
  value: string | null | undefined,
  label: string,
  options: { max: number; min: number; pattern: RegExp },
) {
  const text = requireText(value, label);

  assertAscii(text, label);

  if (text.length < options.min || text.length > options.max) {
    throw new WorkflowError(`${label} must be ${options.min}-${options.max} characters.`);
  }

  if (!options.pattern.test(text)) {
    throw new WorkflowError(`${label} contains invalid characters.`);
  }

  return text;
}


function requirePositiveAssetQuantity(value: number | null | undefined) {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    throw new WorkflowError("Quantity must be greater than 0.");
  }

  return value as number;
}
function validateSerialNo(
  value: string | null | undefined,
  trackMethod: AssetTrackMethod,
) {
  const serialNo = cleanText(value);

  if (trackMethod === AssetTrackMethod.QUANTITY) {
    if (serialNo) {
      throw new WorkflowError("Serial no. must be empty for quantity assets.");
    }

    return null;
  }

  return requirePatternText(serialNo, "Serial no.", {
    max: 255,
    min: 1,
    pattern: /^[A-Za-z0-9-]+$/,
  });
}

const fallbackDomainStockPrefixes: Record<string, string> = {
  NETWORK: "NW",
  SERVER: "SV",
};

function stockTypeCode(assetType: { code: string | null; name: string }) {
  const source = cleanText(assetType.code) ?? assetType.name;
  const normalized = source.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  return (normalized || "XX").padEnd(2, "X").slice(0, 2);
}

async function generateStockCode(
  tx: Prisma.TransactionClient,
  domainCode: string,
  assetType: { code: string | null; name: string },
) {
  const domain = await tx.assetDomain.findUnique({
    select: { prefix: true },
    where: { code: domainCode },
  });
  const domainPrefix = cleanText(domain?.prefix) ?? fallbackDomainStockPrefixes[domainCode] ?? domainCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(2, "X").slice(0, 2);
  const prefix = `${domainPrefix}-${stockTypeCode(assetType)}`;
  const latest = await tx.asset.findFirst({
    orderBy: { stockCode: "desc" },
    select: { stockCode: true },
    where: { stockCode: { startsWith: prefix } },
  });
  const latestSequence = latest?.stockCode?.slice(prefix.length).match(/^\d{4}$/)
    ? Number.parseInt(latest.stockCode.slice(prefix.length), 10)
    : 0;

  for (let sequence = latestSequence + 1; sequence <= 9999; sequence += 1) {
    const stockCode = `${prefix}${String(sequence).padStart(4, "0")}`;
    const duplicate = await tx.asset.findFirst({
      select: { id: true },
      where: { stockCode },
    });

    if (!duplicate) {
      return stockCode;
    }
  }

  throw new WorkflowError("Unable to generate stock code.", 409, "STOCK_CODE_EXHAUSTED");
}

function editableStatuses(currentStatus: AssetStatus) {
  return currentStatus === AssetStatus.REQUEST
    ? [
        AssetStatus.REQUEST,
        AssetStatus.READY,
        AssetStatus.BORROW,
        AssetStatus.USING,
        AssetStatus.SOLD,
      ]
    : [
        AssetStatus.READY,
        AssetStatus.BORROW,
        AssetStatus.USING,
        AssetStatus.SOLD,
        AssetStatus.FAIL,
        AssetStatus.LOST,
        AssetStatus.NEED_CHECK,
      ];
}

async function getAssetEditOptions(user: CurrentUser, currentStatus: AssetStatus) {
  const manageableDomainCodes = hasRole(user, "ADMIN")
    ? null
    : user.permissions
        .filter((permission) => permission.canManage)
        .map((permission) => permission.domainCode);

  const domainWhere = {
    isActive: true,
    ...(manageableDomainCodes ? { code: { in: manageableDomainCodes } } : {}),
  };

  const [domains, categories, locations, types] = await Promise.all([
    db.assetDomain.findMany({
      orderBy: { name: "asc" },
      select: { code: true, inventoryFamily: true, name: true },
      where: domainWhere,
    }),
    db.assetCategory.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        domain: { select: { code: true } },
        name: true,
      },
      where: {
        domain: domainWhere,
        isActive: true,
      },
    }),
    db.location.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
      where: { isActive: true },
    }),
    db.assetType.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        category: {
          select: {
            domain: { select: { code: true } },
            name: true,
          },
        },
        code: true,
        name: true,
        trackMethod: true,
      },
      where: {
        category: { domain: domainWhere },
        isActive: true,
      },
    }),
  ]);

  const uniqueTypes = Array.from(
    new Map(
      types
        .map((type) => [
          `${type.category.domain.code}:${type.name}`,
          {
            categoryName: type.category.name,
            code: type.code,
            domainCode: type.category.domain.code,
            name: type.name,
            trackMethod: type.trackMethod,
          },
        ]),
    ).values(),
  );

  return {
    categories: categories.map((category) => ({
      domainCode: category.domain.code,
      name: category.name,
    })),
    domains,
    locations,
    statuses: editableStatuses(currentStatus),
    types: uniqueTypes,
  };
}

export async function getAssetEditForUser(
  user: CurrentUser,
  assetId: string,
): Promise<AssetEditResult> {
  const asset = await db.asset.findUnique({
    select: assetEditSelect,
    where: { id: assetId },
  });

  if (!asset || !asset.isActive) {
    return { kind: "notFound" };
  }

  if (!canManageDomainForUser(user, asset.domain.code)) {
    return { kind: "forbidden" };
  }

  return {
    asset,
    canChangeDomain: hasRole(user, "ADMIN"),
    kind: "ok",
    options: await getAssetEditOptions(user, asset.status),
  };
}

export async function getAssetCreateForUser(
  user: CurrentUser,
  preferredDomainCode?: string | null,
): Promise<AssetCreateResult> {
  const options = await getAssetEditOptions(user, AssetStatus.READY);

  if (options.domains.length === 0) {
    return { kind: "forbidden" };
  }

  const requestedDomainCode = cleanText(preferredDomainCode);

  const initialDomainCode =
    requestedDomainCode &&
    options.domains.some((domain) => domain.code === requestedDomainCode)
      ? requestedDomainCode
      : options.domains[0].code;

  return {
    canChangeDomain: hasRole(user, "ADMIN"),
    initialDomainCode,
    kind: "ok",
    options,
  };
}

async function resolveCategory(
  tx: Prisma.TransactionClient,
  domainId: string,
  categoryName: string | null,
) {
  if (!categoryName) {
    return null;
  }

  const existing = await tx.assetCategory.findFirst({
    where: { domainId, name: categoryName },
  });

  if (existing) {
    return existing;
  }

  return tx.assetCategory.create({
    data: {
      domainId,
      name: categoryName,
    },
  });
}

async function resolveLocation(
  tx: Prisma.TransactionClient,
  input: Pick<UpdateAssetInput, "locationCode" | "locationName">,
) {
  const locationCode = cleanText(input.locationCode);
  const locationName = cleanText(input.locationName);

  if (!locationCode && !locationName) {
    return null;
  }

  if (locationCode) {
    const existingByCode = await tx.location.findUnique({
      where: { code: locationCode },
    });

    if (existingByCode) {
      return existingByCode;
    }
  }

  if (locationName) {
    const existingByName = await tx.location.findUnique({
      where: { name: locationName },
    });

    if (existingByName) {
      return existingByName;
    }
  }

  const name = locationName ?? locationCode;

  if (!name) {
    return null;
  }

  return tx.location.create({
    data: {
      code: locationCode,
      name,
    },
  });
}

async function resolveAssetType(
  tx: Prisma.TransactionClient,
  categoryId: string | null,
  typeName: string | null,
) {
  if (!categoryId || !typeName) {
    return null;
  }

  return tx.assetType.upsert({
    where: { categoryId_name: { categoryId, name: typeName } },
    update: { isActive: true },
    create: {
      categoryId,
      name: typeName,
      trackMethod: AssetTrackMethod.SERIAL,
    },
    select: {
      code: true,
      id: true,
      name: true,
      trackMethod: true,
    },
  });
}

async function resolveAssetModel(
  tx: Prisma.TransactionClient,
  input: {
    assetTypeId: string | null;
    brand: string | null;
    categoryId: string | null;
    description: string | null;
    domainId: string;
    modelName: string;
    modelNo: string | null;
    partNo: string | null;
    typeName: string | null;
  },
) {
  const existing = await tx.assetModel.findFirst({
    where: {
      brand: input.brand,
      categoryId: input.categoryId,
      domainId: input.domainId,
      assetTypeId: input.assetTypeId,
      modelNo: input.modelNo,
      name: input.modelName,
      partNo: input.partNo,
      typeName: input.typeName,
    },
  });

  if (existing) {
    return tx.assetModel.update({
      data: { description: input.description },
      where: { id: existing.id },
    });
  }

  return tx.assetModel.create({
    data: {
      brand: input.brand,
      categoryId: input.categoryId,
      assetTypeId: input.assetTypeId,
      description: input.description,
      domainId: input.domainId,
      modelNo: input.modelNo,
      name: input.modelName,
      partNo: input.partNo,
      typeName: input.typeName,
    },
  });
}

export async function updateAssetForUser(
  user: CurrentUser,
  assetId: string,
  input: UpdateAssetInput,
) {
  const modelName = requirePatternText(input.modelName, "Asset model", {
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 \-\/()+.]+$/,
  });
  const brand = requirePatternText(input.brand, "Brand", {
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 \-\/()+.]+$/,
  });
  const categoryName = requireText(input.categoryName, "Category");
  const description = cleanText(input.description);
  const locationText = requirePatternText(input.locationText, "Location", {
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 ,\-.\/]+$/,
  });
  const modelNo = cleanText(input.modelNo);
  const note = cleanText(input.note);
  const partNo = requirePatternText(input.partNo, "Part no.", {
    max: 20,
    min: 2,
    pattern: /^[A-Za-z0-9\-\/.]+$/,
  });
  const sourceRecordId = cleanText(input.sourceRecordId);
  const sourceSystem = cleanText(input.sourceSystem);
  const imageRef = cleanText(input.imageRef);
  const typeName = requireText(input.typeName, "Type");
  const assetNo = cleanText(input.assetNo);

  return db.$transaction(
    async (tx) => {
      const asset = await tx.asset.findUnique({
        select: {
          domain: { select: { code: true } },
          assetQuantity: true,
          id: true,
          serialNo: true,
          status: true,
        },
        where: { id: assetId },
      });

      if (!asset) {
        throw new WorkflowError("Asset not found.", 404);
      }

      assertCanManageDomain(user, asset.domain.code);

      if (
        input.domainCode !== asset.domain.code &&
        !canManageDomainForUser(user, input.domainCode)
      ) {
        throw new WorkflowError(
          `Cannot move asset to ${input.domainCode}.`,
          403,
          "CANNOT_CHANGE_DOMAIN",
        );
      }

      if (
        input.status === AssetStatus.REQUEST &&
        asset.status !== AssetStatus.REQUEST
      ) {
        throw new WorkflowError(
          "REQUEST status must be created by request flow.",
          409,
          "REQUEST_STATUS_RESTRICTED",
        );
      }

      if (
        input.status !== asset.status &&
        !canTransitionAssetStatus(asset.status, input.status)
      ) {
        throw new WorkflowError(
          `Cannot change ${asset.serialNo ?? asset.id} from ${asset.status} to ${input.status}.`,
          409,
          "INVALID_STATUS_TRANSITION",
        );
      }

      if (input.status !== asset.status && !note) {
        throw new WorkflowError("Remark is required when changing status.");
      }

      const targetDomain = await tx.assetDomain.findFirst({
        select: { code: true, id: true, inventoryFamily: true, name: true },
        where: { code: input.domainCode, isActive: true },
      });

      if (!targetDomain) {
        throw new WorkflowError("Target domain not found.", 404);
      }

      const category = await resolveCategory(tx, targetDomain.id, categoryName);
      const assetType = await resolveAssetType(
        tx,
        category?.id ?? null,
        typeName,
      );

      if (!assetType) {
        throw new WorkflowError("Type is required.");
      }

      const serialNo = validateSerialNo(input.serialNo, targetDomain.inventoryFamily);
      const nextQuantity = targetDomain.inventoryFamily === AssetTrackMethod.QUANTITY
        ? requirePositiveAssetQuantity(input.quantity)
        : 1;

      if (serialNo) {
        const duplicateSerial = await tx.asset.findFirst({
          select: { id: true },
          where: {
            id: { not: asset.id },
            serialNo,
          },
        });

        if (duplicateSerial) {
          throw new WorkflowError(
            "Serial no. already exists.",
            409,
            "DUPLICATE_SERIAL_NO",
          );
        }
      }

      const location = await resolveLocation(tx, {
        locationCode: null,
        locationName: locationText,
      });
      const assetModel = await resolveAssetModel(tx, {
        assetTypeId: assetType.id,
        brand,
        categoryId: category?.id ?? null,
        description,
        domainId: targetDomain.id,
        modelName,
        modelNo,
        partNo,
        typeName,
      });

      const updatedAsset = await tx.asset.update({
        data: {
          assetModelId: assetModel.id,
          assetNo,
          assetQuantity: nextQuantity,
          domainId: targetDomain.id,
          imageRef,
          isActive: input.isActive ?? true,
          legacyFg: null,
          legacyQty: null,
          locationId: location?.id ?? null,
          locationText,
          note,
          requestLockedAt: input.status === AssetStatus.REQUEST ? undefined : null,
          requestLockedById: input.status === AssetStatus.REQUEST ? undefined : null,
          serialNo,
          sourceRecordId,
          sourceSystem,
          status: input.status,
          updatedById: user.id,
        },
        select: assetEditSelect,
        where: { id: asset.id },
      });

      if (input.status !== asset.status) {
        await tx.assetStatusHistory.create({
          data: {
            actionType: getManualStatusAction(asset.status, input.status),
            assetId: asset.id,
            changedById: user.id,
            fromStatus: asset.status,
            note,
            toStatus: input.status,
          },
        });
      }

      if (
        targetDomain.inventoryFamily === AssetTrackMethod.QUANTITY &&
        nextQuantity !== asset.assetQuantity
      ) {
        if (!note) {
          throw new WorkflowError("Remark is required when adjusting quantity.");
        }

        await tx.assetStatusHistory.create({
          data: {
            actionType: AssetActionType.ADJUST_QUANTITY,
            assetId: asset.id,
            changedById: user.id,
            fromStatus: asset.status,
            newQuantity: nextQuantity,
            note: `${note} - by ${user.name}`,
            previousQuantity: asset.assetQuantity,
            toStatus: input.status,
          },
        });
      }

      return updatedAsset;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function deleteAssetForUser(user: CurrentUser, assetId: string) {
  return db.$transaction(
    async (tx) => {
      const asset = await tx.asset.findUnique({
        select: {
          domain: { select: { code: true } },
          id: true,
          isActive: true,
          status: true,
        },
        where: { id: assetId },
      });

      if (!asset || !asset.isActive) {
        throw new WorkflowError("Asset not found.", 404);
      }

      assertCanDeleteAssets(user, asset.domain.code);

      const deletedAsset = await tx.asset.update({
        data: {
          isActive: false,
          requestLockedAt: null,
          requestLockedById: null,
          updatedById: user.id,
        },
        select: {
          id: true,
        },
        where: { id: asset.id },
      });

      await tx.assetStatusHistory.create({
        data: {
          actionType: AssetActionType.STATUS_CHANGE,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: asset.status,
          note: "Asset deleted from inventory.",
          toStatus: asset.status,
        },
      });

      return deletedAsset;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createAssetForUser(user: CurrentUser, input: CreateAssetInput) {
  const modelName = requirePatternText(input.modelName, "Asset model", {
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 \-\/()+.]+$/,
  });
  const brand = requirePatternText(input.brand, "Brand", {
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 \-\/()+.]+$/,
  });
  const categoryName = requireText(input.categoryName, "Category");
  const description = cleanText(input.description);
  const locationText = requirePatternText(input.locationText, "Location", {
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 ,\-.\/]+$/,
  });
  const modelNo = cleanText(input.modelNo);
  const note = cleanText(input.note);
  const partNo = requirePatternText(input.partNo, "Part no.", {
    max: 20,
    min: 2,
    pattern: /^[A-Za-z0-9\-\/.]+$/,
  });
  const sourceRecordId = cleanText(input.sourceRecordId);
  const sourceSystem = cleanText(input.sourceSystem);
  const imageRef = cleanText(input.imageRef);
  const typeName = requireText(input.typeName, "Type");
  const assetNo = cleanText(input.assetNo);

  if (input.status === AssetStatus.REQUEST) {
    throw new WorkflowError(
      "REQUEST status must be created by request flow.",
      409,
      "REQUEST_STATUS_RESTRICTED",
    );
  }

  assertCanManageDomain(user, input.domainCode);

  return db.$transaction(
    async (tx) => {
      const targetDomain = await tx.assetDomain.findFirst({
        select: { code: true, id: true, inventoryFamily: true, name: true },
        where: { code: input.domainCode, isActive: true },
      });

      if (!targetDomain) {
        throw new WorkflowError("Target domain not found.", 404);
      }

      const category = await resolveCategory(tx, targetDomain.id, categoryName);
      const assetType = await resolveAssetType(
        tx,
        category?.id ?? null,
        typeName,
      );

      if (!assetType) {
        throw new WorkflowError("Type is required.");
      }

      const serialNo = validateSerialNo(input.serialNo, targetDomain.inventoryFamily);
      const nextQuantity = targetDomain.inventoryFamily === AssetTrackMethod.QUANTITY
        ? requirePositiveAssetQuantity(input.quantity)
        : 1;

      if (serialNo) {
        const duplicateSerial = await tx.asset.findFirst({
          select: { id: true },
          where: { serialNo },
        });

        if (duplicateSerial) {
          throw new WorkflowError(
            "Serial no. already exists.",
            409,
            "DUPLICATE_SERIAL_NO",
          );
        }
      }

      const stockCode = await generateStockCode(tx, input.domainCode, assetType);
      const location = await resolveLocation(tx, {
        locationCode: null,
        locationName: locationText,
      });
      const assetModel = await resolveAssetModel(tx, {
        assetTypeId: assetType.id,
        brand,
        categoryId: category?.id ?? null,
        description,
        domainId: targetDomain.id,
        modelName,
        modelNo,
        partNo,
        typeName,
      });

      const createdAsset = await tx.asset.create({
        data: {
          assetModelId: assetModel.id,
          assetNo,
          assetQuantity: nextQuantity,
          createdById: user.id,
          domainId: targetDomain.id,
          imageRef,
          isActive: input.isActive ?? true,
          legacyFg: null,
          legacyQty: null,
          locationId: location?.id ?? null,
          locationText,
          note,
          serialNo,
          sourceRecordId,
          sourceSystem,
          status: input.status,
          stockCode,
          updatedById: user.id,
        },
        select: assetEditSelect,
      });

      await tx.assetStatusHistory.create({
        data: {
          actionType: AssetActionType.CREATE,
          assetId: createdAsset.id,
          changedById: user.id,
          fromStatus: null,
          note: note
            ? `Asset registered in ${targetDomain.name} inventory. ${note}`
            : `Asset registered in ${targetDomain.name} inventory.`,
          toStatus: input.status,
        },
      });

      return createdAsset;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}





