import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { approveTransaction } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  comment: z.string().max(1000).optional().nullable(),
  prices: z.record(z.string().uuid(), z.string().trim().max(30)).optional(),
  totals: z.record(z.string().uuid(), z.string().trim().max(30)).optional(),
  priceGroups: z.record(z.string().uuid(), z.array(z.object({ quantity: z.number().int().positive(), unitPrice: z.string().trim().max(30), total: z.string().trim().max(30) })).min(1).max(1000)).optional(),
  returnConditions: z.record(z.string().uuid(), z.enum(["NEW", "USED"])).optional(),
  returnStockAssetIds: z.record(z.string().uuid(), z.string().uuid()).optional(),
  soldPrice: z.string().trim().max(30).optional().nullable(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await readJsonBody(request));
    const transaction = await approveTransaction(user, id, {
      comment: body.comment,
      prices: body.prices,
      totals: body.totals,
      priceGroups: body.priceGroups,
      returnConditions: body.returnConditions,
      returnStockAssetIds: body.returnStockAssetIds,
      soldPrice: body.soldPrice,
    });

    return apiJson({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
