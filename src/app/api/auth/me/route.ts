import { apiJson } from "@/lib/api";
import { NextRequest } from "next/server";
import { getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await getUserFromSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    return apiJson({ message: "Unauthorized." }, { status: 401 });
  }

  return apiJson({ user });
}

