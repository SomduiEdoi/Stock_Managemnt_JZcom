import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { releaseAssetsFromRequest } from "@/lib/workflow";

const releaseRequestSchema = z.object({
  assetIds: z.array(z.string().uuid()).max(100).optional(),
  items: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        quantity: z.number().int().positive().optional().nullable(),
      }),
    )
    .max(100)
    .optional(),
  note: z.string().max(1000).optional().nullable(),
}).refine(
  (value) => (value.assetIds?.length ?? 0) > 0 || (value.items?.length ?? 0) > 0,
  { message: "Asset items are required." },
);

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const input = releaseRequestSchema.parse(await readJsonBody(request));
    const assets = await releaseAssetsFromRequest(user, input);

    return NextResponse.json({ assets });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
