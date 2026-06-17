import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { releaseAssetsFromRequest } from "@/lib/workflow";

const releaseRequestSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(100),
  note: z.string().max(1000).optional().nullable(),
});

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
