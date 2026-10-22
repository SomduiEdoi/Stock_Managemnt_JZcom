import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson, apiErrorResponse, requireApiUser } from "@/lib/api";
import { verifyDeletePassword } from "@/lib/destructive-auth";
import { readLimitedBody } from "@/lib/upload-limits";
export async function POST(request: NextRequest) {
  try {
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
    if (request.headers.get("origin") !== expected) return apiJson({ message: "Invalid request origin." }, { status: 403 });
    const user = await requireApiUser(request);
    const input = z.object({ password: z.string().min(1).max(1024), scope: z.string().max(300).regex(/^\/(users|projects|assets|warehouses)\/[^/]+(\/categories)?$/) }).strict().parse(JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 8192))));
    return apiJson({ proof: await verifyDeletePassword(user.id, input.password, input.scope) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
