import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireApiUser } from "@/lib/api";
import { getTransactionExportForUser } from "@/lib/transaction-export";
import { WorkflowError } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });

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
