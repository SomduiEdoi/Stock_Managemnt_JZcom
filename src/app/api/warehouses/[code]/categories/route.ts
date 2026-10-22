import { CustomFieldDataType, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  apiJson,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanManageWarehouse } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

const customFieldInputSchema = z.object({
  assetTypeId: z.string().uuid().optional().nullable(),
  dataType: z
    .enum([
      CustomFieldDataType.TEXT,
      CustomFieldDataType.NUMBER,
      CustomFieldDataType.DROPDOWN,
      CustomFieldDataType.BOOLEAN,
    ])
    .default(CustomFieldDataType.TEXT),
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

const optionalPrefixSchema = (length: 2 | 3, label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z
      .string()
      .trim()
      .regex(
        new RegExp(`^[A-Za-z0-9]{${length}}$`),
        `${label} prefix must be exactly ${length} English letters or numbers.`,
      )
      .nullable()
      .optional(),
  );

const typeInputSchema = z.object({
  code: optionalPrefixSchema(3, "Type"),
  delete: z.boolean().optional(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
});

const categoryInputSchema = z.object({
  code: optionalPrefixSchema(2, "Category"),
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
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function cleanCode(value: string | null | undefined) {
  const cleaned = value?.trim().toUpperCase();

  return cleaned || null;
}

import { requireDeleteProof } from "@/lib/destructive-auth";
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { code } = await context.params;
    const warehouseCode = decodeURIComponent(code).toUpperCase();
    assertCanManageWarehouse(user, warehouseCode);

    const body = saveCategoriesSchema.parse(await readJsonBody(request));
    if (body.categories.some((category) => (category.id && category.delete) || category.types.some((type) => type.id && type.delete))) {
      await requireDeleteProof(request, user.id, `/warehouses/${encodeURIComponent(warehouseCode)}/categories`);
    }
    await db.$transaction(
      async (tx) => {
        assertCanManageWarehouse(user, warehouseCode);
        const warehouse = await tx.assetWarehouse.findFirst({
          select: { id: true },
          where: { code: warehouseCode, isActive: true },
        });

        if (!warehouse) {
          throw new WorkflowError(
            "Warehouse not found.",
            404,
            "WAREHOUSE_NOT_FOUND",
          );
        }

        // Validate the complete tree, including deletions, before the first write.
        for (const category of body.categories) {
          if (
            category.id &&
            !(await tx.assetCategory.findFirst({
              where: { id: category.id, warehouseId: warehouse.id },
              select: { id: true },
            }))
          ) {
            throw new WorkflowError(
              "Category not found.",
              404,
              "CATEGORY_NOT_FOUND",
            );
          }
          for (const type of category.types) {
            if (
              type.id &&
              (!category.id ||
                !(await tx.assetType.findFirst({
                  where: {
                    id: type.id,
                    categoryId: category.id,
                    category: { warehouseId: warehouse.id },
                  },
                  select: { id: true },
                })))
            ) {
              throw new WorkflowError("Type not found.", 404, "TYPE_NOT_FOUND");
            }
          }
          for (const field of category.customFields) {
            if (
              field.id &&
              (!category.id ||
                !(await tx.assetCategoryCustomField.findFirst({
                  where: {
                    id: field.id,
                    categoryId: category.id,
                    category: { warehouseId: warehouse.id },
                  },
                  select: { id: true },
                })))
            ) {
              throw new WorkflowError(
                "Custom field not found.",
                404,
                "CUSTOM_FIELD_NOT_FOUND",
              );
            }
            if (
              field.assetTypeId &&
              (!category.id ||
                !(await tx.assetType.findFirst({
                  where: {
                    id: field.assetTypeId,
                    categoryId: category.id,
                    category: { warehouseId: warehouse.id },
                  },
                  select: { id: true },
                })))
            ) {
              throw new WorkflowError("Type not found.", 404, "TYPE_NOT_FOUND");
            }
          }
        }

        const submittedCategories = body.categories.filter(
          (category) => !category.delete,
        );
        const submittedCategoryCodes = submittedCategories
          .map((category) => cleanCode(category.code))
          .filter((categoryCode): categoryCode is string =>
            Boolean(categoryCode),
          );
        const duplicateSubmittedCategoryCode = submittedCategoryCodes.find(
          (categoryCode, index) =>
            submittedCategoryCodes.indexOf(categoryCode) !== index,
        );

        if (duplicateSubmittedCategoryCode) {
          throw new WorkflowError(
            `Category prefix ${duplicateSubmittedCategoryCode} is already used.`,
            409,
            "CATEGORY_CODE_DUPLICATED",
          );
        }

        const submittedExistingCategoryIds = submittedCategories
          .map((category) => category.id)
          .filter((id): id is string => Boolean(id));

        if (submittedExistingCategoryIds.length > 0) {
          const existingCategories = await tx.assetCategory.findMany({
            select: { code: true, id: true },
            where: {
              id: { in: submittedExistingCategoryIds },
              isActive: true,
              warehouseId: warehouse.id,
            },
          });
          const existingCodeById = new Map(
            existingCategories.map((category) => [
              category.id,
              cleanCode(category.code),
            ]),
          );
          const changedPrefix = submittedCategories.find(
            (category) =>
              category.id &&
              cleanCode(category.code) !== existingCodeById.get(category.id),
          );

          if (changedPrefix) {
            throw new WorkflowError(
              "Category prefix cannot be edited after creation.",
              400,
              "CATEGORY_CODE_LOCKED",
            );
          }
        }

        if (submittedCategoryCodes.length > 0) {
          const existingCategoryCode = await tx.assetCategory.findFirst({
            select: { code: true },
            where: {
              code: { in: submittedCategoryCodes },
              isActive: true,
              warehouseId: warehouse.id,
              ...(submittedExistingCategoryIds.length > 0
                ? { NOT: { id: { in: submittedExistingCategoryIds } } }
                : {}),
            },
          });

          if (existingCategoryCode?.code) {
            throw new WorkflowError(
              `Category prefix ${existingCategoryCode.code} is already used.`,
              409,
              "CATEGORY_CODE_DUPLICATED",
            );
          }
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
          const existingTypes = await tx.assetType.findMany({
            select: { code: true, id: true },
            where: {
              category: { warehouseId: warehouse.id },
              id: { in: submittedExistingTypeIds },
              isActive: true,
            },
          });
          const existingCodeById = new Map(
            existingTypes.map((type) => [type.id, cleanCode(type.code)]),
          );
          const changedPrefix = submittedTypes.find(
            (type) =>
              type.id && cleanCode(type.code) !== existingCodeById.get(type.id),
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
          const existingCode = await tx.assetType.findFirst({
            select: { code: true },
            where: {
              category: { warehouseId: warehouse.id },
              code: { in: submittedCodes },
              isActive: true,
              ...(submittedIds.length > 0
                ? { NOT: { id: { in: submittedIds } } }
                : {}),
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

        for (const categoryInput of body.categories) {
          if (categoryInput.delete) {
            if (categoryInput.id) {
              const activeAssets = await tx.asset.count({
                where: {
                  isActive: true,
                  assetModel: { categoryId: categoryInput.id },
                },
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
                where: { id: categoryInput.id, warehouseId: warehouse.id },
              });
            }
            continue;
          }

          const category = categoryInput.id
            ? await tx.assetCategory.update({
                data: { isActive: true, name: categoryInput.name },
                where: { id: categoryInput.id, warehouseId: warehouse.id },
              })
            : await tx.assetCategory.upsert({
                create: {
                  code: cleanCode(categoryInput.code),
                  warehouseId: warehouse.id,
                  name: categoryInput.name,
                },
                update: { isActive: true },
                where: {
                  warehouseId_name: {
                    warehouseId: warehouse.id,
                    name: categoryInput.name,
                  },
                },
              });

          const activeFields = categoryInput.customFields.filter(
            (field) => !field.delete,
          );

          if (activeFields.length > 20) {
            throw new WorkflowError(
              "A category can have at most 20 custom fields.",
              400,
              "CUSTOM_FIELD_LIMIT",
            );
          }

          for (const [
            fieldIndex,
            fieldInput,
          ] of categoryInput.customFields.entries()) {
            if (fieldInput.delete) {
              if (fieldInput.id) {
                await tx.assetCategoryCustomField.update({
                  data: { isActive: false },
                  where: { id: fieldInput.id, categoryId: category.id },
                });
              }
              continue;
            }

            const key =
              fieldInput.key?.trim() || fieldKeyFromLabel(fieldInput.label);

            if (!key) {
              throw new WorkflowError(
                "Custom field label must contain English letters or numbers.",
                400,
                "CUSTOM_FIELD_KEY_INVALID",
              );
            }

            if (fieldInput.assetTypeId) {
              const fieldType = await tx.assetType.findFirst({
                select: { id: true },
                where: {
                  categoryId: category.id,
                  id: fieldInput.assetTypeId,
                  isActive: true,
                },
              });

              if (!fieldType) {
                throw new WorkflowError(
                  "Custom field type scope is invalid.",
                  404,
                  "CUSTOM_FIELD_TYPE_INVALID",
                );
              }
            }

            const data = {
              dataType: fieldInput.dataType,
              assetTypeId: fieldInput.assetTypeId ?? null,
              isActive: true,
              isFilterable: fieldInput.isFilterable,
              isRequired: fieldInput.isRequired,
              isSearchable: fieldInput.isSearchable,
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
                where: { id: fieldInput.id, categoryId: category.id },
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
                  where: {
                    isActive: true,
                    assetModel: { assetTypeId: typeInput.id },
                  },
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
                  where: { id: typeInput.id, categoryId: category.id },
                });
              }
              continue;
            }

            const data = {
              code: cleanCode(typeInput.code),
              isActive: true,
              name: typeInput.name,
            };

            if (typeInput.id) {
              await tx.assetType.update({
                data: {
                  isActive: true,
                  name: data.name,
                },
                where: { id: typeInput.id, categoryId: category.id },
              });
            } else {
              await tx.assetType.upsert({
                create: { ...data, categoryId: category.id },
                update: { isActive: true },
                where: {
                  categoryId_name: { categoryId: category.id, name: data.name },
                },
              });
            }
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return apiJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
