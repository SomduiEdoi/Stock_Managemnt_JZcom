import { AssetStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { changeAssetStatus } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const changeStatusSchema = z.object({
  note: z.string().min(1).max(1000),
  status: z.nativeEnum(AssetStatus),
});
const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = changeStatusSchema.parse(await readJsonBody(request));
    const asset = await changeAssetStatus(user, {
      assetId: id,
      note: body.note,
      toStatus: body.status,
    });

    return NextResponse.json({ asset });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
