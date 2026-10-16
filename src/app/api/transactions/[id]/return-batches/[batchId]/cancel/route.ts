import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, apiJson, requireApiUser } from "@/lib/api";
import { cancelReturnBatch } from "@/lib/workflow";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; batchId: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id, batchId } = z.object({ id: z.string().uuid(), batchId: z.string().uuid() }).parse(await context.params);
    return apiJson({ transaction: await cancelReturnBatch(user, id, batchId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
