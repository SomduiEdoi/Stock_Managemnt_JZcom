import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import { getTransactionExportForUser } from "@/lib/transaction-export";
import { updatePendingTransactionRequest, WorkflowError } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });
const patchSchema = z.object({
  items: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        quantity: z.number().int().positive().optional().nullable(),
      }),
    )
    .max(100)
    .optional(),
  internalRequest: z.boolean().optional().default(false),
  note: z.string().max(1000).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  projectRequest: z.boolean().optional().default(false),
  purpose: z.string().trim().min(1).max(1000),
  serviceRequest: z.boolean().optional().default(false),
  type: z.nativeEnum(TransactionType),
});

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const transaction = await getTransactionExportForUser(user, id);

    if (!transaction) {
      throw new WorkflowError("Transaction not found.", 404);
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const input = patchSchema.parse(await readJsonBody(request));
    const transaction = await updatePendingTransactionRequest(user, id, input);

    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
