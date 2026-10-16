import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { saveSalePriceDraft } from "@/lib/workflow";

const schema = z.object({
  prices: z.record(z.string().uuid(), z.string().trim().max(30)).optional(),
  totals: z.record(z.string().uuid(), z.string().trim().max(30)).optional(),
  priceGroups: z.record(z.string().uuid(), z.array(z.object({ quantity: z.number().int().positive(), unitPrice: z.string().trim().max(30), total: z.string().trim().max(30) })).min(1).max(1000)).optional(),
  soldPrice: z.string().trim().max(30).optional().nullable(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
    return apiJson(await saveSalePriceDraft(user, id, schema.parse(await readJsonBody(request))));
  } catch (error) { return apiErrorResponse(error); }
}
