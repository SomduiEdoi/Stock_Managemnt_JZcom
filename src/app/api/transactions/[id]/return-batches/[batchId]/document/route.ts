import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireApiUser } from "@/lib/api";
import { getDamageDocument } from "@/lib/return-batch-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; batchId: string }> };
const paramsSchema = z.object({ id: z.string().uuid(), batchId: z.string().uuid() });

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id, batchId } = paramsSchema.parse(await context.params);
    const { pdf, filename } = await getDamageDocument(user, id, batchId);
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "return-document.pdf";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
