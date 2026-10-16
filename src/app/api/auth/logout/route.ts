import { apiJson } from "@/lib/api";
import {
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
} from "@/lib/session";

export async function POST() {
  const response = apiJson({ ok: true });

  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    expiredSessionCookieOptions(),
  );

  return response;
}

