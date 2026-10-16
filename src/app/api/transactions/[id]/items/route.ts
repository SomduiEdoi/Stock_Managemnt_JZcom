import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { addItemsToPendingTransaction } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });
const addItemsSchema = z.object({
  items: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        quantity: z.number().int().positive().optional().nullable(),
      }),
    )
    .min(1, "Asset items are required.")
    .max(100),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const input = addItemsSchema.parse(await readJsonBody(request));
    const transaction = await addItemsToPendingTransaction(user, id, input);

    return apiJson({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

