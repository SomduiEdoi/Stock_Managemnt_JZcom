import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { returnTransactionItems } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>;
};

const returnItemSchema = z.object({
  note: z.string().max(1000).optional().nullable(),
});
const paramsSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, itemId } = paramsSchema.parse(await context.params);
    const body = returnItemSchema.parse(await readJsonBody(request));
    const transaction = await returnTransactionItems(user, {
      itemIds: [itemId],
      note: body.note,
      transactionId: id,
    });

    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
