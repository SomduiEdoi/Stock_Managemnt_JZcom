import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUserFromSessionToken } from "@/lib/auth";
import { authenticateWithLdap } from "@/lib/ldap";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
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

  try {
    const directoryUser = await authenticateWithLdap(
      parsed.data.email,
      parsed.data.password,
    );

    if (!directoryUser) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 },
      );
    }

    const user = await db.user.findFirst({
      where: {
        isActive: true,
        email: (directoryUser.email ?? parsed.data.email).toLowerCase(),
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Your email is not registered in Stock Management." },
        { status: 403 },
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
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { message: "Database is unavailable. Start PostgreSQL and try again." },
        { status: 503 },
      );
    }

    throw error;
  }
}
