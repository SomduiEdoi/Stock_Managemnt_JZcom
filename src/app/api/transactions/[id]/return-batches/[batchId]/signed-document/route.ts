import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, apiJson, requireApiUser } from "@/lib/api";
import { uploadSignedReturnDocument, getSignedReturnDocument } from "@/lib/return-batch-service";
import { WorkflowError } from "@/lib/workflow";
import { readLimitedBody, MAX_SIGNED_PDF_BYTES, MAX_PDF_REQUEST_BYTES } from "@/lib/upload-limits";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; batchId: string }> };
const paramsSchema = z.object({ id: z.string().uuid(), batchId: z.string().uuid() });

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireApiUser(request);
    const { id, batchId } = paramsSchema.parse(await context.params);
    const document = await getSignedReturnDocument(id, batchId);
    return new Response(new Uint8Array(document.pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, batchId } = paramsSchema.parse(await context.params);
    const body = await readLimitedBody(request, MAX_PDF_REQUEST_BYTES);
    const formData = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: body as BodyInit }).formData().catch(() => {
      throw new WorkflowError("Invalid upload form.", 400);
    });
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new WorkflowError("Signed PDF file is required.", 400);
    }
    if (file.size > MAX_SIGNED_PDF_BYTES) throw new WorkflowError("Upload a PDF no larger than 10 MiB.", 413, "REQUEST_TOO_LARGE");
    const batch = await uploadSignedReturnDocument(user, id, batchId, {
      data: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
    });
    return apiJson({ batch });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
