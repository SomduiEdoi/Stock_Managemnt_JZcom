import { NextRequest } from "next/server";
import { apiErrorResponse, apiJson, requireApiUser } from "@/lib/api";
import { changeLocalPassword, changePasswordSchema } from "@/lib/change-local-password";
import { readLimitedBody } from "@/lib/upload-limits";

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) return apiJson({ message: "Invalid request origin." }, { status: 403 });
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
