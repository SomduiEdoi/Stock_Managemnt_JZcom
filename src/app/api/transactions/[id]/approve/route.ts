import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import { approveTransaction } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  comment: z.string().max(1000).optional().nullable(),
  soldPrice: z.string().trim().max(30).optional().nullable(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await readJsonBody(request));
    const transaction = await approveTransaction(user, id, { comment: body.comment, soldPrice: body.soldPrice });

    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
