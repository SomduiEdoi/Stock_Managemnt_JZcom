import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { findStoremanSerialOptions, swapStoremanSerialNumber } from "@/lib/workflow";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };
const paramsSchema = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });
const bodySchema = z.object({ replacementAssetId: z.string().uuid() });

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, itemId } = paramsSchema.parse(await context.params);
    const search = request.nextUrl.searchParams.get("q") ?? "";
    return apiJson({ assets: await findStoremanSerialOptions(user, id, itemId, search) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, itemId } = paramsSchema.parse(await context.params);
    const { replacementAssetId } = bodySchema.parse(await readJsonBody(request));
    return apiJson(await swapStoremanSerialNumber(user, id, itemId, replacementAssetId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

