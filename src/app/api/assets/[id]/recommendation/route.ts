import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { setAssetRecommendation } from "@/lib/asset-recommendation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ recommended: z.boolean() });

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const { recommended } = bodySchema.parse(await readJsonBody(request));
    const asset = await setAssetRecommendation(user, id, recommended);

    return apiJson({ asset });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

