import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUserFromSessionToken } from "@/lib/auth";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Email and password are required." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      isActive: true,
      passwordHash: true,
    },
  });

  const passwordMatches =
    user?.isActive && user.passwordHash
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;

  if (!user || !passwordMatches) {
    return NextResponse.json(
      { message: "Invalid email or password." },
      { status: 401 },
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = createSessionToken(user.id);
  const currentUser = await getUserFromSessionToken(token);
  const response = NextResponse.json({ user: currentUser });

  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  return response;
}
