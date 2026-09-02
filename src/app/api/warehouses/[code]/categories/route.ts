import { CustomFieldDataType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanManageWarehouse } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

const customFieldInputSchema = z.object({
  dataType: z.enum([CustomFieldDataType.TEXT, CustomFieldDataType.NUMBER]).default(CustomFieldDataType.TEXT),
  delete: z.boolean().optional(),
  id: z.string().uuid().optional(),
  isFilterable: z.boolean().default(false),
  isRequired: z.boolean().default(false),
  isSearchable: z.boolean().default(false),
  key: z.string().trim().max(80).optional(),
  label: z.string().trim().min(1).max(80),
  optionsText: z.string().trim().max(2000).optional().default(""),
  placeholder: z.string().trim().max(255).optional().default(""),
  sortOrder: z.number().int().min(0).max(99).default(0),
  unit: z.string().trim().max(30).optional().default(""),
});

const typeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9]{3}$/,
      "Type prefix must be exactly 3 English letters or numbers.",
    )
    .nullable()
    .optional(),
  delete: z.boolean().optional(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
});

const categoryInputSchema = z.object({
  delete: z.boolean().optional(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  customFields: z.array(customFieldInputSchema).default([]),
  types: z.array(typeInputSchema).default([]),
});

const saveCategoriesSchema = z.object({
  categories: z.array(categoryInputSchema),
});

type RouteContext = {
  params: Promise<{ code: string }>;
};

function fieldKeyFromLabel(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
}


function cleanCode(value: string | null | undefined) {
  const cleaned = value?.trim().toUpperCase();

  return cleaned || null;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { code } = await context.params;
    const warehouseCode = decodeURIComponent(code).toUpperCase();
    assertCanManageWarehouse(user, warehouseCode);

    const body = saveCategoriesSchema.parse(await readJsonBody(request));
    const warehouse = await db.assetWarehouse.findFirst({
      select: { id: true, inventoryFamily: true },
      where: { code: warehouseCode, isActive: true },
    });

    if (!warehouse) {
      throw new WorkflowError("Warehouse not found.", 404, "WAREHOUSE_NOT_FOUND");
    }

    const submittedTypes = body.categories
      .filter((category) => !category.delete)
      .flatMap((category) => category.types.filter((type) => !type.delete));
    const submittedCodes = submittedTypes
      .map((type) => cleanCode(type.code))
      .filter((typeCode): typeCode is string => Boolean(typeCode));
    const duplicateSubmittedCode = submittedCodes.find(
      (typeCode, index) => submittedCodes.indexOf(typeCode) !== index,
    );

    if (duplicateSubmittedCode) {
      throw new WorkflowError(
        `Prefix ${duplicateSubmittedCode} is already used.`,
        409,
        "TYPE_CODE_DUPLICATED",
      );
    }
    const submittedExistingTypeIds = submittedTypes
      .map((type) => type.id)
      .filter((id): id is string => Boolean(id));

    if (submittedExistingTypeIds.length > 0) {
      const existingTypes = await db.assetType.findMany({
        select: { code: true, id: true },
        where: {
          category: { warehouseId: warehouse.id },
          id: { in: submittedExistingTypeIds },
          isActive: true,
        },
      });
      const existingCodeById = new Map(existingTypes.map((type) => [type.id, cleanCode(type.code)]));
      const changedPrefix = submittedTypes.find(
        (type) => type.id && cleanCode(type.code) !== existingCodeById.get(type.id),
      );

      if (changedPrefix) {
        throw new WorkflowError(
          "Type prefix cannot be edited after creation.",
          400,
          "TYPE_CODE_LOCKED",
        );
      }
    }

    if (submittedCodes.length > 0) {
      const submittedIds = submittedTypes
        .map((type) => type.id)
        .filter((id): id is string => Boolean(id));
      const existingCode = await db.assetType.findFirst({
        select: { code: true },
        where: {
          category: { warehouseId: warehouse.id },
          code: { in: submittedCodes },
          isActive: true,
          ...(submittedIds.length > 0 ? { NOT: { id: { in: submittedIds } } } : {}),
        },
      });

      if (existingCode?.code) {
        throw new WorkflowError(
          `Prefix ${existingCode.code} is already used.`,
          409,
          "TYPE_CODE_DUPLICATED",
        );
      }
    }

    await db.$transaction(async (tx) => {
      for (const categoryInput of body.categories) {
        if (categoryInput.delete) {
          if (categoryInput.id) {
            const activeAssets = await tx.asset.count({
              where: { isActive: true, assetModel: { categoryId: categoryInput.id } },
            });

            if (activeAssets > 0) {
              throw new WorkflowError(
                "Cannot delete a category that still has active assets.",
                409,
                "CATEGORY_IN_USE",
              );
            }

            await tx.assetCategory.update({
              data: { isActive: false },
              where: { id: categoryInput.id },
            });
          }
          continue;
        }

        const category = categoryInput.id
          ? await tx.assetCategory.update({
              data: { isActive: true, name: categoryInput.name },
              where: { id: categoryInput.id },
            })
          : await tx.assetCategory.upsert({
              create: { warehouseId: warehouse.id, name: categoryInput.name },
              update: { isActive: true },
              where: { warehouseId_name: { warehouseId: warehouse.id, name: categoryInput.name } },
            });

        const activeFields = categoryInput.customFields.filter((field) => !field.delete);

        if (activeFields.length > 5) {
          throw new WorkflowError(
            "A category can have at most 5 custom fields.",
            400,
            "CUSTOM_FIELD_LIMIT",
          );
        }

        for (const [fieldIndex, fieldInput] of categoryInput.customFields.entries()) {
          if (fieldInput.delete) {
            if (fieldInput.id) {
              await tx.assetCategoryCustomField.update({
                data: { isActive: false },
                where: { id: fieldInput.id },
              });
            }
            continue;
          }

          const key = fieldInput.key?.trim() || fieldKeyFromLabel(fieldInput.label);

          if (!key) {
            throw new WorkflowError("Custom field label must contain English letters or numbers.", 400, "CUSTOM_FIELD_KEY_INVALID");
          }

          const data = {
            dataType: fieldInput.dataType,
            isActive: true,
            isFilterable: fieldInput.isFilterable,
            isRequired: fieldInput.isRequired,
            isSearchable: fieldInput.isFilterable,
            key,
            label: fieldInput.label,
            options: [],
            placeholder: null,
            sortOrder: fieldInput.sortOrder || fieldIndex,
            unit: fieldInput.unit || null,
          };

          if (fieldInput.id) {
            await tx.assetCategoryCustomField.update({
              data,
              where: { id: fieldInput.id },
            });
          } else {
            await tx.assetCategoryCustomField.upsert({
              create: { ...data, categoryId: category.id },
              update: data,
              where: { categoryId_key: { categoryId: category.id, key } },
            });
          }
        }

        for (const typeInput of categoryInput.types) {
          if (typeInput.delete) {
            if (typeInput.id) {
              const activeAssets = await tx.asset.count({
                where: { isActive: true, assetModel: { assetTypeId: typeInput.id } },
              });

              if (activeAssets > 0) {
                throw new WorkflowError(
                  "Cannot delete a type that still has active assets.",
                  409,
                  "TYPE_IN_USE",
                );
              }

              await tx.assetType.update({
                data: { isActive: false },
                where: { id: typeInput.id },
              });
            }
            continue;
          }

          const data = {
            code: cleanCode(typeInput.code),
            isActive: true,
            name: typeInput.name,
            trackMethod: warehouse.inventoryFamily,
          };

          if (typeInput.id) {
            await tx.assetType.update({
              data: {
                isActive: true,
                name: data.name,
                trackMethod: data.trackMethod,
              },
              where: { id: typeInput.id },
            });
          } else {
            await tx.assetType.upsert({
              create: { ...data, categoryId: category.id },
              update: { isActive: true },
              where: { categoryId_name: { categoryId: category.id, name: data.name } },
            });
          }
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
