import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AssetStatus } from "@prisma/client";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { resolveTransactionItems } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const returnTransactionSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      note: z.string().max(1000).optional().nullable(),
      soldPrice: z.string().trim().max(30).optional().nullable(),
      toStatus: z.nativeEnum(AssetStatus),
    }),
  ).min(1).max(100),
});
const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = returnTransactionSchema.parse(await readJsonBody(request));
    const transaction = await resolveTransactionItems(user, {
      items: body.items,
      transactionId: id,
    });

    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
