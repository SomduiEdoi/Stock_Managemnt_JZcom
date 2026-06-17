import { AssetDomainCode, AssetStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assertCanManageDomain,
  canManageDomainForUser,
  domainCodes,
  hasRole,
} from "@/lib/permissions";
import { canTransitionAssetStatus, getManualStatusAction } from "@/lib/workflow-rules";
import { WorkflowError } from "@/lib/workflow";

const assetEditSelect = Prisma.validator<Prisma.AssetSelect>()({
  assetNo: true,
  assetModel: {
    select: {
      brand: true,
      category: { select: { id: true, name: true } },
      description: true,
      domain: { select: { code: true, id: true, name: true } },
      id: true,
      modelNo: true,
      name: true,
      partNo: true,
      typeName: true,
    },
  },
  domain: { select: { code: true, id: true, name: true } },
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
  categories: Array<{ domainCode: AssetDomainCode; name: string }>;
  domains: Array<{ code: AssetDomainCode; name: string }>;
  locations: Array<{ code: string | null; name: string }>;
  statuses: AssetStatus[];
  types: Array<{ domainCode: AssetDomainCode; name: string }>;
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

export type UpdateAssetInput = {
  assetNo?: string | null;
  brand?: string | null;
  categoryName?: string | null;
  domainCode: AssetDomainCode;
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
  serialNo: string;
  sourceRecordId?: string | null;
  sourceSystem?: string | null;
  status: AssetStatus;
  stockCode?: string | null;
  typeName?: string | null;
};

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
  const manageableDomainCodes = domainCodes.filter((domainCode) =>
    canManageDomainForUser(user, domainCode),
  );

  const [domains, categories, locations, types] = await Promise.all([
    db.assetDomain.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
      where: { code: { in: manageableDomainCodes }, isActive: true },
    }),
    db.assetCategory.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        domain: { select: { code: true } },
        name: true,
      },
      where: {
        domain: { code: { in: manageableDomainCodes } },
        isActive: true,
      },
    }),
    db.location.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
      where: { isActive: true },
    }),
    db.assetModel.findMany({
      orderBy: [{ typeName: "asc" }],
      select: {
        domain: { select: { code: true } },
        typeName: true,
      },
      where: {
        domain: { code: { in: manageableDomainCodes } },
        isActive: true,
        NOT: { typeName: null },
      },
    }),
  ]);

  const uniqueTypes = Array.from(
    new Map(
      types
        .filter((type) => type.typeName)
        .map((type) => [
          `${type.domain.code}:${type.typeName}`,
          {
            domainCode: type.domain.code,
            name: type.typeName as string,
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

async function resolveAssetModel(
  tx: Prisma.TransactionClient,
  input: {
    brand: string | null;
    categoryId: string | null;
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
      modelNo: input.modelNo,
      name: input.modelName,
      partNo: input.partNo,
      typeName: input.typeName,
    },
  });

  if (existing) {
    return existing;
  }

  return tx.assetModel.create({
    data: {
      brand: input.brand,
      categoryId: input.categoryId,
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
  const serialNo = requireText(input.serialNo, "Serial no.");
  const modelName = requireText(input.modelName, "Asset model");
  const brand = cleanText(input.brand);
  const categoryName = cleanText(input.categoryName);
  const locationText = cleanText(input.locationText);
  const modelNo = cleanText(input.modelNo);
  const note = cleanText(input.note);
  const partNo = cleanText(input.partNo);
  const sourceRecordId = cleanText(input.sourceRecordId);
  const sourceSystem = cleanText(input.sourceSystem);
  const stockCode = cleanText(input.stockCode);
  const imageRef = cleanText(input.imageRef);
  const typeName = cleanText(input.typeName);
  const assetNo = cleanText(input.assetNo);

  return db.$transaction(
    async (tx) => {
      const asset = await tx.asset.findUnique({
        select: {
          domain: { select: { code: true } },
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
          `Cannot change ${asset.serialNo} from ${asset.status} to ${input.status}.`,
          409,
          "INVALID_STATUS_TRANSITION",
        );
      }

      if (input.status !== asset.status && !note) {
        throw new WorkflowError("Remark is required when changing status.");
      }

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

      const targetDomain = await tx.assetDomain.findFirst({
        where: { code: input.domainCode, isActive: true },
      });

      if (!targetDomain) {
        throw new WorkflowError("Target domain not found.", 404);
      }

      const category = await resolveCategory(tx, targetDomain.id, categoryName);
      const location = await resolveLocation(tx, {
        locationCode: input.locationCode,
        locationName: input.locationName,
      });
      const assetModel = await resolveAssetModel(tx, {
        brand,
        categoryId: category?.id ?? null,
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
          domainId: targetDomain.id,
          imageRef,
          isActive: input.isActive ?? true,
          legacyFg: input.legacyFg ?? null,
          legacyQty: input.legacyQty ?? null,
          locationId: location?.id ?? null,
          locationText,
          note,
          requestLockedAt: input.status === AssetStatus.REQUEST ? undefined : null,
          requestLockedById: input.status === AssetStatus.REQUEST ? undefined : null,
          serialNo,
          sourceRecordId,
          sourceSystem,
          status: input.status,
          stockCode,
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

      return updatedAsset;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
