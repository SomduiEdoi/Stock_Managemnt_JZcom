import { AssetStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { createAssetForUser } from "@/lib/asset-edit";

const nullableString = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const createAssetSchema = z.object({
  assetNo: nullableString(255),
  brand: z.string().trim().min(1).max(255),
  categoryName: z.string().trim().min(1).max(255),
  description: nullableString(2000),
  domainCode: z.string().trim().min(1).max(32),
  imageRef: z.string().trim().max(2_000_000).optional().nullable(),
  isActive: z.boolean().optional(),
  legacyFg: z.number().int().nullable().optional(),
  legacyQty: z.number().int().nullable().optional(),
  locationCode: nullableString(255),
  locationName: z.string().trim().min(1).max(255),
  locationText: z.string().trim().min(1).max(255),
  modelName: z.string().trim().min(1).max(255),
  modelNo: nullableString(255),
  note: z.string().trim().max(2000).optional().nullable(),
  partNo: z.string().trim().min(1).max(255),
  serialNo: nullableString(255),
  sourceRecordId: nullableString(255),
  sourceSystem: nullableString(255),
  status: z.nativeEnum(AssetStatus),
  stockCode: nullableString(255),
  quantity: z.coerce.number().int().positive().optional().nullable(),
  typeName: z.string().trim().min(1).max(255),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = createAssetSchema.parse(await readJsonBody(request));
    const asset = await createAssetForUser(user, body);

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}



