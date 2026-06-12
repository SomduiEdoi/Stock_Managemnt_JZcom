import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { returnTransactionItems } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const returnTransactionSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  note: z.string().max(1000).optional().nullable(),
});
const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = returnTransactionSchema.parse(await readJsonBody(request));
    const transaction = await returnTransactionItems(user, {
      itemIds: body.itemIds,
      note: body.note,
      transactionId: id,
    });

    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
