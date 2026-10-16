import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, apiJson, readJsonBody, requireApiUser } from "@/lib/api";
import { checkReturnOutcomes, saveReturnInspectionNotes, getReturnBatchReviews } from "@/lib/return-batch-service";

type RouteContext = { params: Promise<{ id: string; batchId: string }> };

const paramsSchema = z.object({ id: z.string().uuid(), batchId: z.string().uuid() });
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, batchId } = paramsSchema.parse(await context.params);
    const batch = (await getReturnBatchReviews(user, id)).find((entry) => entry.id === batchId);
    if (!batch?.canCheck) return apiJson({ message: "Only the current warehouse Storeman can load stock targets." }, { status: 403 });
    return apiJson({ outcomes: batch.outcomes.filter((outcome) => outcome.canCheck).map((outcome) => ({ id: outcome.id, stockOptions: outcome.stockOptions })) });
  } catch (error) { return apiErrorResponse(error); }
}
const checkSchema = z.object({
  outcomeIds: z.array(z.string().uuid()).min(1).refine(
    (ids) => new Set(ids).size === ids.length,
    "Outcome IDs must be unique.",
  ),
  stockTargets: z.record(z.string().uuid(), z.string().uuid()).default({}),
  inspectionNotes: z.record(z.string().uuid(), z.string().max(2000)).default({}),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, batchId } = paramsSchema.parse(await context.params);
    const { outcomeIds, stockTargets, inspectionNotes } = checkSchema.parse(await readJsonBody(request));
    const batch = await checkReturnOutcomes(user, id, batchId, outcomeIds, stockTargets, inspectionNotes);
    return apiJson({ batch });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, batchId } = paramsSchema.parse(await context.params);
    const { inspectionNotes } = z.object({ inspectionNotes: z.record(z.string().uuid(), z.string().max(2000)) }).parse(await readJsonBody(request));
    return apiJson(await saveReturnInspectionNotes(user, id, batchId, inspectionNotes));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
