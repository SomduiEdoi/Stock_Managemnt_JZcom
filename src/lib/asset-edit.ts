import { AssetTrackMethod } from "@/lib/asset-tracking";
import {
  AssetActionType,
  AssetCondition,
  AssetStatus,
  Prisma,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assertCanDeleteAssets,
  assertCanManageWarehouse,
  canManageWarehouseForUser,
  hasRole,
} from "@/lib/permissions";
import { canTransitionAssetStatus, getManualStatusAction } from "@/lib/workflow-rules";
import { WorkflowError } from "@/lib/workflow";

const assetEditSelect = Prisma.validator<Prisma.AssetSelect>()({
  assetNo: true,
  assetQuantity: true,
  condition: true,
  assetModel: {
    select: {
      isSerialized: true,
      brand: true,
      category: {
        select: {
          customFields: {
            orderBy: { sortOrder: "asc" },
            select: {
              dataType: true,
              id: true,
              isFilterable: true,
              isRequired: true,
              isSearchable: true,
              key: true,
              label: true,
              options: true,
              placeholder: true,
              sortOrder: true,
              unit: true,
            },
            where: { isActive: true },
          },
          id: true,
          name: true,
        },
      },
      description: true,
      warehouse: { select: { code: true, id: true, name: true } },
      id: true,
      modelNo: true,
      name: true,
      partNo: true,
      typeName: true,
    },
  },
  warehouse: { select: { code: true, id: true, name: true } },
  id: true,
  imageRef: true,
  isActive: true,
  location: { select: { code: true, id: true, name: true } },
  locationText: true,
  note: true,
  requestLockedAt: true,
  requestLockedBy: { select: { email: true, id: true, name: true } },
  serialNo: true,
  sourceRecordId: true,
  sourceSystem: true,
  status: true,
  specifications: true,
  stockCode: true,
  updatedAt: true,
  customFieldValues: {
    select: {
      field: { select: { key: true, label: true } },
      fieldId: true,
      valueBoolean: true,
      valueJson: true,
      valueNumber: true,
      valueText: true,
    },
  },
});

export type AssetEditRecord = Prisma.AssetGetPayload<{
  select: typeof assetEditSelect;
}>;

export type AssetEditOptions = {
  brands: string[];
  categories: Array<{
    customFields: Array<{
      dataType: "TEXT" | "NUMBER" | "DROPDOWN" | "BOOLEAN";
      id: string;
      isFilterable: boolean;
      isRequired: boolean;
      isSearchable: boolean;
      key: string;
      label: string;
      options: string[];
      placeholder: string | null;
      sortOrder: number;
      unit: string | null;
    }>;
    warehouseCode: string;
    name: string;
  }>;
  partNos: string[];
  warehouses: Array<{ code: string; name: string }>;
  locations: Array<{ code: string | null; name: string }>;
  models: Array<{
    brand: string | null;
    categoryName: string | null;
    description: string | null;
    modelNo: string | null;
    name: string;
    partNo: string | null;
    isSerialized: boolean;
    typeName: string | null;
    warehouseCode: string;
  }>;
  statuses: AssetStatus[];
  types: Array<{ categoryName: string; code: string | null; warehouseCode: string; name: string }>;
};

export type AssetEditResult =
  | {
      asset: AssetEditRecord;
      canChangeWarehouse: boolean;
      kind: "ok";
      options: AssetEditOptions;
    }
  | { kind: "forbidden" }
  | { kind: "notFound" };

export type AssetCreateResult =
  | {
      canChangeWarehouse: boolean;
      initialWarehouseCode: string;
      kind: "ok";
      options: AssetEditOptions;
    }
  | { kind: "forbidden" };

export type UpdateAssetInput = {
  condition?: AssetCondition;
  assetNo?: string | null;
  brand?: string | null;
  categoryName?: string | null;
  customFields?: Record<string, string | null | undefined>;
  description?: string | null;
  warehouseCode: string;
  imageRef?: string | null;
  isActive?: boolean;
  locationCode?: string | null;
  locationName?: string | null;
  locationText?: string | null;
  modelName: string;
  modelNo?: string | null;
  note?: string | null;
  partNo?: string | null;
  modelTrackMethod?: AssetTrackMethod;
  serialNo?: string | null;
  sourceRecordId?: string | null;
  sourceSystem?: string | null;
  status: AssetStatus;
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

function optionalPatternText(
  value: string | null | undefined,
  label: string,
  options: { max: number; min: number; pattern: RegExp },
) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  if (text === "-") {
    return null;
  }

  assertAscii(text, label);

  if (text.length < options.min || text.length > options.max) {
    throw new WorkflowError(`${label} must be ${options.min}-${options.max} characters.`);
  }

  if (!options.pattern.test(text)) {
    throw new WorkflowError(`${label} contains invalid characters.`);
  }

  return text;
}


function requireNonnegativeAssetQuantity(value: number | null | undefined) {
  if (!Number.isInteger(value) || value == null || value < 0) {
    throw new WorkflowError("Quantity must be a whole number greater than or equal to 0.");
  }

  return value as number;
}

function buildSpecificationSnapshot(
  values: Record<string, string | null | undefined> | undefined,
) {
  const specifications: Record<string, string> = {};

  Object.entries(values ?? {}).forEach(([key, rawValue]) => {
    const value = cleanText(rawValue);

    if (key.trim() && value) {
      specifications[key.trim()] = value;
    }
  });

  return specifications as Prisma.InputJsonObject;
}

function parseBooleanCustomFieldValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  throw new WorkflowError("Boolean custom field must be true/false or yes/no.");
}

function buildCustomFieldValueData(
  field: { dataType: "BOOLEAN" | "DROPDOWN" | "NUMBER" | "TEXT"; label: string },
  value: string,
) {
  if (field.dataType === "NUMBER") {
    const numericValue = Number(value.replace(/,/g, ""));

    if (!Number.isFinite(numericValue)) {
      throw new WorkflowError(`${field.label} must be a valid number.`);
    }

    return {
      valueBoolean: null,
      valueJson: Prisma.JsonNull,
      valueNumber: numericValue,
      valueText: value,
    };
  }

  if (field.dataType === "BOOLEAN") {
    return {
      valueBoolean: parseBooleanCustomFieldValue(value),
      valueJson: Prisma.JsonNull,
      valueNumber: null,
      valueText: value,
    };
  }

  return {
    valueBoolean: null,
    valueJson: Prisma.JsonNull,
    valueNumber: null,
    valueText: value,
  };
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

  return optionalPatternText(serialNo, "Serial no.", {
    max: 255,
    min: 1,
    pattern: /^[A-Za-z0-9-]+$/,
  });
}

const fallbackWarehouseStockPrefixes: Record<string, string> = {
  NETWORK: "NW",
  SERVER: "SV",
};

function stockTypeCode(assetType: { code: string | null; name: string }) {
  const source = cleanText(assetType.code) ?? assetType.name;
  const normalized = source.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  return (normalized || "XXX").padEnd(3, "X").slice(0, 3);
}

function stockCategoryCode(category: { code?: string | null; name: string | null } | null | undefined) {
  const source = cleanText(category?.code) ?? category?.name ?? "XX";
  const normalized = source.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  return (normalized || "XX").padEnd(2, "X").slice(0, 2);
}

async function generateStockCode(
  tx: Prisma.TransactionClient,
  warehouseCode: string,
  assetType: { category?: { code: string | null; name: string } | null; code: string | null; name: string },
) {
  const warehouse = await tx.assetWarehouse.findUnique({
    select: { prefix: true },
    where: { code: warehouseCode },
  });
  const warehousePrefix = cleanText(warehouse?.prefix) ?? fallbackWarehouseStockPrefixes[warehouseCode] ?? warehouseCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(2, "X").slice(0, 2);
  const prefix = `${warehousePrefix}-${stockCategoryCode(assetType.category)}-${stockTypeCode(assetType)}`;
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
  const manageableWarehouseCodes = hasRole(user, "ADMIN")
    ? null
    : user.permissions
        .filter((permission) => permission.canManage)
        .map((permission) => permission.warehouseCode);

  const warehouseWhere = {
    isActive: true,
    ...(manageableWarehouseCodes ? { code: { in: manageableWarehouseCodes } } : {}),
  };

  const [warehouses, categories, locations, types, assetModels] = await Promise.all([
    db.assetWarehouse.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
      where: warehouseWhere,
    }),
    db.assetCategory.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        customFields: {
          orderBy: { sortOrder: "asc" },
          select: {
            dataType: true,
            id: true,
            isFilterable: true,
            isRequired: true,
            isSearchable: true,
            key: true,
            label: true,
            options: true,
            placeholder: true,
            sortOrder: true,
            unit: true,
          },
          where: { isActive: true },
        },
        warehouse: { select: { code: true } },
        name: true,
      },
      where: {
        warehouse: warehouseWhere,
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
            warehouse: { select: { code: true } },
            name: true,
          },
        },
        code: true,
        name: true,
      },
      where: {
        category: { warehouse: warehouseWhere },
        isActive: true,
      },
    }),
    db.assetModel.findMany({
      select: {
        brand: true,
        category: { select: { name: true } },
        description: true,
        modelNo: true,
        name: true,
        partNo: true,
        isSerialized: true,
        typeName: true,
        warehouse: { select: { code: true } },
      },
      where: { isActive: true, warehouse: warehouseWhere },
    }),
  ]);

  const uniqueTypes = Array.from(
    new Map(
      types
        .map((type) => [
          `${type.category.warehouse.code}:${type.name}`,
          {
            categoryName: type.category.name,
            code: type.code,
            warehouseCode: type.category.warehouse.code,
            name: type.name,
          },
        ]),
    ).values(),
  );

  return {
    brands: [...new Set(assetModels.map((model) => model.brand).filter((brand): brand is string => Boolean(brand)))].sort((left, right) => left.localeCompare(right)),
    categories: categories.map((category) => ({
      customFields: category.customFields.map((field) => ({
        dataType: field.dataType,
        id: field.id,
        isFilterable: field.isFilterable,
        isRequired: field.isRequired,
        isSearchable: field.isSearchable,
        key: field.key,
        label: field.label,
        options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string") : [],
        placeholder: field.placeholder,
        sortOrder: field.sortOrder,
        unit: field.unit,
      })),
      warehouseCode: category.warehouse.code,
      name: category.name,
    })),
    partNos: [...new Set(assetModels.map((model) => model.partNo).filter((partNo): partNo is string => Boolean(partNo)))].sort((left, right) => left.localeCompare(right)),
    warehouses,
    locations,
    models: assetModels.map((model) => ({
      brand: model.brand,
      categoryName: model.category?.name ?? null,
      description: model.description,
      modelNo: model.modelNo,
      name: model.name,
      partNo: model.partNo,
      isSerialized: model.isSerialized,
      typeName: model.typeName,
      warehouseCode: model.warehouse.code,
    })),
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

  if (!canManageWarehouseForUser(user, asset.warehouse.code)) {
    return { kind: "forbidden" };
  }

  return {
    asset,
    canChangeWarehouse: false,
    kind: "ok",
    options: await getAssetEditOptions(user, asset.status),
  };
}

export async function getAssetCreateForUser(
  user: CurrentUser,
  preferredWarehouseCode?: string | null,
): Promise<AssetCreateResult> {
  const options = await getAssetEditOptions(user, AssetStatus.READY);

  if (options.warehouses.length === 0) {
    return { kind: "forbidden" };
  }

  const requestedWarehouseCode = cleanText(preferredWarehouseCode);

  const initialWarehouseCode =
    requestedWarehouseCode &&
    options.warehouses.some((warehouse) => warehouse.code === requestedWarehouseCode)
      ? requestedWarehouseCode
      : options.warehouses[0].code;

  return {
    canChangeWarehouse: hasRole(user, "ADMIN"),
    initialWarehouseCode,
    kind: "ok",
    options,
  };
}

async function resolveCategory(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  categoryName: string | null,
) {
  if (!categoryName) {
    return null;
  }

  const existing = await tx.assetCategory.findFirst({
    where: { warehouseId, name: categoryName },
  });

  if (existing) {
    return existing;
  }

  return tx.assetCategory.create({
    data: {
      warehouseId,
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
    },
    select: {
      category: { select: { code: true, name: true } },
      code: true,
      id: true,
      name: true,
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
    warehouseId: string;
    modelName: string;
    modelNo: string | null;
    partNo: string | null;
    typeName: string | null;
    trackMethod: AssetTrackMethod;
  },
) {
  const existing = await tx.assetModel.findFirst({
    where: {
      brand: input.brand,
      categoryId: input.categoryId,
      warehouseId: input.warehouseId,
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
      warehouseId: input.warehouseId,
      modelNo: input.modelNo,
      name: input.modelName,
      partNo: input.partNo,
      typeName: input.typeName,
      isSerialized: input.trackMethod === AssetTrackMethod.SERIAL,
    },
  });
}

async function saveCustomFieldValues(
  tx: Prisma.TransactionClient,
  assetId: string,
  categoryId: string | null,
  values: Record<string, string | null | undefined> | undefined,
) {
  if (!categoryId) {
    return;
  }

  const fields = await tx.assetCategoryCustomField.findMany({
    orderBy: { sortOrder: "asc" },
    select: { dataType: true, id: true, isRequired: true, key: true, label: true },
    where: { categoryId, isActive: true },
  });

  for (const field of fields) {
    const value = cleanText(values?.[field.key]);

    if (field.isRequired && !value) {
      throw new WorkflowError(field.label + " is required.");
    }

    if (value) {
      const data = buildCustomFieldValueData(field, value);

      await tx.assetCustomFieldValue.upsert({
        create: { ...data, assetId, fieldId: field.id },
        update: data,
        where: { assetId_fieldId: { assetId, fieldId: field.id } },
      });
    } else {
      await tx.assetCustomFieldValue.deleteMany({
        where: { assetId, fieldId: field.id },
      });
    }
  }
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
  const partNo = optionalPatternText(input.partNo, "Part no.", {
    max: 20,
    min: 2,
    pattern: /^[A-Za-z0-9\-\/.]+$/,
  });
  const sourceRecordId = cleanText(input.sourceRecordId);
  const sourceSystem = cleanText(input.sourceSystem);
  const imageRef = cleanText(input.imageRef);
  const typeName = requireText(input.typeName, "Type");
  const assetNo = cleanText(input.assetNo);
  const specifications = buildSpecificationSnapshot(input.customFields);

  return db.$transaction(
    async (tx) => {
      const asset = await tx.asset.findUnique({
        select: {
          warehouse: { select: { code: true } },
          assetQuantity: true,
          condition: true,
          id: true,
          serialNo: true,
          status: true,
        },
        where: { id: assetId },
      });

      if (!asset) {
        throw new WorkflowError("Asset not found.", 404);
      }

      assertCanManageWarehouse(user, asset.warehouse.code);

      if (input.warehouseCode !== asset.warehouse.code) {
        throw new WorkflowError(
          "Asset warehouse cannot be changed through this endpoint.",
          403,
          "CANNOT_CHANGE_WAREHOUSE",
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

      const targetWarehouse = await tx.assetWarehouse.findFirst({
        select: { code: true, id: true, name: true },
        where: { code: input.warehouseCode, isActive: true },
      });

      if (!targetWarehouse) {
        throw new WorkflowError("Target warehouse not found.", 404);
      }

      const category = await resolveCategory(tx, targetWarehouse.id, categoryName);
      const assetType = await resolveAssetType(
        tx,
        category?.id ?? null,
        typeName,
      );

      if (!assetType) {
        throw new WorkflowError("Type is required.");
      }

      const assetModel = await resolveAssetModel(tx, {
        assetTypeId: assetType.id,
        brand,
        categoryId: category?.id ?? null,
        description,
        warehouseId: targetWarehouse.id,
        modelName,
        modelNo,
        partNo,
        typeName,
        trackMethod: input.modelTrackMethod ?? AssetTrackMethod.SERIAL,
      });
      const serialNo = validateSerialNo(input.serialNo, assetModel.isSerialized ? AssetTrackMethod.SERIAL : AssetTrackMethod.QUANTITY);
      const trackMethod = assetModel.isSerialized && serialNo ? AssetTrackMethod.SERIAL : AssetTrackMethod.QUANTITY;
      const nextQuantity = trackMethod === AssetTrackMethod.QUANTITY
        ? requireNonnegativeAssetQuantity(input.quantity)
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
      const updatedAsset = await tx.asset.update({
        data: {
          assetModelId: assetModel.id,
          assetNo,
          assetQuantity: nextQuantity,
          warehouseId: targetWarehouse.id,
          imageRef,
          isActive: input.isActive ?? true,
          locationId: location?.id ?? null,
          locationText,
          note,
          requestLockedAt: input.status === AssetStatus.REQUEST ? undefined : null,
          requestLockedById: input.status === AssetStatus.REQUEST ? undefined : null,
          serialNo,
          sourceRecordId,
          sourceSystem,
          specifications,
          condition: asset.condition,
          status: input.status,
          updatedById: user.id,
        },
        select: assetEditSelect,
        where: { id: asset.id },
      });

      await saveCustomFieldValues(tx, updatedAsset.id, category?.id ?? null, input.customFields);

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
        trackMethod === AssetTrackMethod.QUANTITY &&
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
          warehouse: { select: { code: true } },
          id: true,
          isActive: true,
          status: true,
        },
        where: { id: assetId },
      });

      if (!asset || !asset.isActive) {
        throw new WorkflowError("Asset not found.", 404);
      }

      assertCanDeleteAssets(user, asset.warehouse.code);

      const [reservationCount, pendingApprovalCount] = await Promise.all([
        tx.assetReservation.count({ where: { assetId: asset.id } }),
        tx.transactionApproval.count({
          where: {
            status: "PENDING",
            transaction: {
              workflowStatus: "PENDING",
              items: { some: { assetId: asset.id } },
            },
          },
        }),
      ]);

      if (reservationCount > 0 || pendingApprovalCount > 0) {
        throw new WorkflowError("Asset cannot be deleted while it has a reservation or pending approval.", 409, "ASSET_DELETE_BLOCKED");
      }

      // Assets are always retained for audit; deletion is an administrative soft delete.

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
  const partNo = optionalPatternText(input.partNo, "Part no.", {
    max: 20,
    min: 2,
    pattern: /^[A-Za-z0-9\-\/.]+$/,
  });
  const sourceRecordId = cleanText(input.sourceRecordId);
  const sourceSystem = cleanText(input.sourceSystem);
  const imageRef = cleanText(input.imageRef);
  const typeName = requireText(input.typeName, "Type");
  const assetNo = cleanText(input.assetNo);
  const specifications = buildSpecificationSnapshot(input.customFields);

  if (input.status === AssetStatus.REQUEST) {
    throw new WorkflowError(
      "REQUEST status must be created by request flow.",
      409,
      "REQUEST_STATUS_RESTRICTED",
    );
  }

  return db.$transaction(
    async (tx) => {
      assertCanManageWarehouse(user, input.warehouseCode);
      const targetWarehouse = await tx.assetWarehouse.findFirst({
        select: { code: true, id: true, name: true },
        where: { code: input.warehouseCode, isActive: true },
      });

      if (!targetWarehouse) {
        throw new WorkflowError("Target warehouse not found.", 404);
      }

      const category = await resolveCategory(tx, targetWarehouse.id, categoryName);
      const assetType = await resolveAssetType(
        tx,
        category?.id ?? null,
        typeName,
      );

      if (!assetType) {
        throw new WorkflowError("Type is required.");
      }

      const assetModel = await resolveAssetModel(tx, {
        assetTypeId: assetType.id,
        brand,
        categoryId: category?.id ?? null,
        description,
        warehouseId: targetWarehouse.id,
        modelName,
        modelNo,
        partNo,
        typeName,
        trackMethod: input.modelTrackMethod ?? AssetTrackMethod.SERIAL,
      });
      const serialNo = validateSerialNo(input.serialNo, assetModel.isSerialized ? AssetTrackMethod.SERIAL : AssetTrackMethod.QUANTITY);
      const trackMethod = assetModel.isSerialized && serialNo ? AssetTrackMethod.SERIAL : AssetTrackMethod.QUANTITY;
      const nextQuantity = trackMethod === AssetTrackMethod.QUANTITY
        ? requireNonnegativeAssetQuantity(input.quantity)
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

      const stockCode = await generateStockCode(tx, input.warehouseCode, assetType);
      const location = await resolveLocation(tx, {
        locationCode: null,
        locationName: locationText,
      });
      const createdAsset = await tx.asset.create({
        data: {
          assetModelId: assetModel.id,
          assetNo,
          assetQuantity: nextQuantity,
          createdById: user.id,
          warehouseId: targetWarehouse.id,
          imageRef,
          isActive: input.isActive ?? true,
          locationId: location?.id ?? null,
          locationText,
          note,
          serialNo,
          sourceRecordId,
          sourceSystem,
          specifications,
          condition: input.condition ?? (Object.entries(specifications).some(([key, value]) => key.toLowerCase() === "used" && String(value).trim().toUpperCase() === "USED") ? AssetCondition.USED : AssetCondition.NEW),
          status: input.status,
          stockCode,
          updatedById: user.id,
        },
        select: assetEditSelect,
      });

      await saveCustomFieldValues(tx, createdAsset.id, category?.id ?? null, input.customFields);

      await tx.assetStatusHistory.create({
        data: {
          actionType: AssetActionType.CREATE,
          assetId: createdAsset.id,
          changedById: user.id,
          fromStatus: null,
          note: note
            ? `Asset registered in ${targetWarehouse.name} inventory. ${note}`
            : `Asset registered in ${targetWarehouse.name} inventory.`,
          toStatus: input.status,
        },
      });

      return createdAsset;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}





