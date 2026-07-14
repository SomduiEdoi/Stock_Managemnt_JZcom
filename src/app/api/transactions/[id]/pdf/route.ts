import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireApiUser } from "@/lib/api";
import { getTransactionExportForUser } from "@/lib/transaction-export";
import { renderTransactionPdf } from "@/lib/transaction-pdf";
import { WorkflowError } from "@/lib/workflow";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const transaction = await getTransactionExportForUser(user, id);

    if (!transaction) {
      throw new WorkflowError("Transaction not found.", 404);
    }

    const pdf = await renderTransactionPdf(transaction);
    const referenceNo = transaction.transactionNo ?? transaction.id;

    return new NextResponse(
      new Blob([pdf as BlobPart], { type: "application/pdf" }),
      {
      headers: {
        "Content-Disposition": `attachment; filename="${safeFileName(referenceNo)}.pdf"`,
        "Content-Type": "application/pdf",
      },
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
