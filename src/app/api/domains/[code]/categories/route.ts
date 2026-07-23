import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanManageDomain } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

const typeInputSchema = z.object({
  code: z.string().trim().max(12).nullable().optional(),
  delete: z.boolean().optional(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
});

const categoryInputSchema = z.object({
  delete: z.boolean().optional(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  types: z.array(typeInputSchema).default([]),
});

const saveCategoriesSchema = z.object({
  categories: z.array(categoryInputSchema),
});

type RouteContext = {
  params: Promise<{ code: string }>;
};

function cleanCode(value: string | null | undefined) {
  const cleaned = value?.trim().toUpperCase();

  return cleaned || null;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { code } = await context.params;
    const domainCode = decodeURIComponent(code).toUpperCase();
    assertCanManageDomain(user, domainCode);

    const body = saveCategoriesSchema.parse(await readJsonBody(request));
    const domain = await db.assetDomain.findFirst({
      select: { id: true, inventoryFamily: true },
      where: { code: domainCode, isActive: true },
    });

    if (!domain) {
      throw new WorkflowError("Domain not found.", 404, "DOMAIN_NOT_FOUND");
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
          category: { domainId: domain.id },
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
          category: { domainId: domain.id },
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
              create: { domainId: domain.id, name: categoryInput.name },
              update: { isActive: true },
              where: { domainId_name: { domainId: domain.id, name: categoryInput.name } },
            });

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
            trackMethod: domain.inventoryFamily,
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
