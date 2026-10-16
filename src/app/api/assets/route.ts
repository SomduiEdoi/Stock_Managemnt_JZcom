import { AssetStatus } from "@prisma/client";
import { AssetTrackMethod } from "@/lib/asset-tracking";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser, apiJson } from "@/lib/api";
import { createAssetForUser } from "@/lib/asset-edit";

const nullableString = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const createAssetSchema = z.object({
  assetNo: nullableString(255),
  brand: z.string().trim().min(1).max(255),
  customFields: z.record(z.string(), nullableString(2000)).optional().default({}),
  categoryName: z.string().trim().min(1).max(255),
  description: nullableString(2000),
  warehouseCode: z.string().trim().min(1).max(32),
  imageRef: z.string().trim().max(2_000_000).optional().nullable(),
  isActive: z.boolean().optional(),
  locationCode: nullableString(255),
  locationName: z.string().trim().min(1).max(255),
  locationText: z.string().trim().min(1).max(255),
  modelName: z.string().trim().min(1).max(255),
  modelTrackMethod: z.nativeEnum(AssetTrackMethod).optional(),
  modelNo: nullableString(255),
  note: z.string().trim().max(2000).optional().nullable(),
  partNo: nullableString(255),
  serialNo: nullableString(255),
  sourceRecordId: nullableString(255),
  sourceSystem: nullableString(255),
  status: z.nativeEnum(AssetStatus),
  quantity: z.coerce.number().int().nonnegative().optional().nullable(),
  typeName: z.string().trim().min(1).max(255),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = createAssetSchema.parse(await readJsonBody(request));
    const asset = await createAssetForUser(user, body);

    return apiJson({ asset }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}




