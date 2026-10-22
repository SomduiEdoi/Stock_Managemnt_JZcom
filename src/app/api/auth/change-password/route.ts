import { NextRequest } from "next/server";
import { apiErrorResponse, apiJson, requireApiUser } from "@/lib/api";
import { changeLocalPassword, changePasswordSchema } from "@/lib/change-local-password";
import { readLimitedBody } from "@/lib/upload-limits";

export async function POST(request: NextRequest) {
  try {
    const configuredUrl = process.env.APP_URL ? new URL(process.env.APP_URL) : null;
    const expectedOrigin = configuredUrl && ["http:", "https:"].includes(configuredUrl.protocol)
      ? configuredUrl.origin
      : request.nextUrl.origin;
    if (request.headers.get("origin") !== expectedOrigin) return apiJson({ message: "Invalid request origin." }, { status: 403 });
    const user = await requireApiUser(request);
    let json: unknown;
    try { json = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 16 * 1024))); }
    catch (error) {
      if (error instanceof SyntaxError) return apiJson({ message: "Invalid request body." }, { status: 400 });
      throw error;
    }
    await changeLocalPassword(user.id, changePasswordSchema.parse(json));
    return apiJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
