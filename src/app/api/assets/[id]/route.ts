import { AssetDomainCode, AssetStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { updateAssetForUser } from "@/lib/asset-edit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const nullableString = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const updateAssetSchema = z.object({
  assetNo: nullableString(255),
  brand: nullableString(255),
  categoryName: nullableString(255),
  domainCode: z.nativeEnum(AssetDomainCode),
  imageRef: z.string().trim().max(2_000_000).optional().nullable(),
  isActive: z.boolean().optional(),
  legacyFg: z.number().int().nullable().optional(),
  legacyQty: z.number().int().nullable().optional(),
  locationCode: nullableString(255),
  locationName: nullableString(255),
  locationText: nullableString(255),
  modelName: z.string().trim().min(1).max(255),
  modelNo: nullableString(255),
  note: z.string().trim().max(2000).optional().nullable(),
  partNo: nullableString(255),
  serialNo: z.string().trim().min(1).max(255),
  sourceRecordId: nullableString(255),
  sourceSystem: nullableString(255),
  status: z.nativeEnum(AssetStatus),
  stockCode: nullableString(255),
  typeName: nullableString(255),
});

const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = updateAssetSchema.parse(await readJsonBody(request));
    const asset = await updateAssetForUser(user, id, body);

    return NextResponse.json({ asset });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
