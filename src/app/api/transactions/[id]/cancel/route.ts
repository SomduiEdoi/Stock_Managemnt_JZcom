import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireApiUser } from "@/lib/api";
import { cancelTransactionRequest } from "@/lib/workflow";

type RouteContext = { params: Promise<{ id: string }> };
const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const transaction = await cancelTransactionRequest(user, id);
    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
