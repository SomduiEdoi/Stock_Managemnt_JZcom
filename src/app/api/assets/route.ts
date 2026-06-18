import { AssetDomainCode, AssetStatus } from "@prisma/client";
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
  domainCode: z.nativeEnum(AssetDomainCode),
  imageRef: z.string().trim().min(1).max(2_000_000),
  isActive: z.boolean().optional(),
  legacyFg: z.number().int().min(1),
  legacyQty: z.number().int().min(1),
  locationCode: nullableString(255),
  locationName: z.string().trim().min(1).max(255),
  locationText: z.string().trim().min(1).max(255),
  modelName: z.string().trim().min(1).max(255),
  modelNo: nullableString(255),
  note: z.string().trim().max(2000).optional().nullable(),
  partNo: z.string().trim().min(1).max(255),
  serialNo: z.string().trim().min(1).max(255),
  sourceRecordId: nullableString(255),
  sourceSystem: nullableString(255),
  status: z.nativeEnum(AssetStatus),
  stockCode: z.string().trim().min(1).max(255),
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
