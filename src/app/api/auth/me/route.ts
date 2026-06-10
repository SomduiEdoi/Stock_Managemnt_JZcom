import { NextRequest, NextResponse } from "next/server";
import { getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await getUserFromSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({ user });
}
