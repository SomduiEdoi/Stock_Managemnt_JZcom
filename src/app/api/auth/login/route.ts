import { apiJson, apiErrorResponse } from "@/lib/api";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { checkLoginLimit } from "@/lib/login-security";
import { readLimitedBody } from "@/lib/upload-limits";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUserFromSessionToken } from "@/lib/auth";
import { authenticateWithLdap, LdapDirectoryError } from "@/lib/ldap";
import { isDatabaseUnavailableError } from "@/lib/prisma-errors";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

const loginSchema = z.object({
  mode: z.enum(["AD", "LOCAL"]).default("AD"),
  email: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(1024),
});
const dummyHash = hash(randomBytes(32).toString("hex"), 12);

export async function POST(request: Request) {
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 16 * 1024))); }
  catch (error) {
    if (error instanceof SyntaxError) return apiJson({ message: "Invalid request body." }, { status: 400 });
    return apiErrorResponse(error);
  }
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return apiJson(
      { message: "Email and password are required." },
      { status: 400 },
    );
  }

  try {
    const { email, password, mode } = parsed.data;
    if (mode === "AD" && /[\s\x00]/.test(email)) return apiJson({ message: "Enter a valid AD username or UPN." }, { status: 400 });
    const network = process.env.AUTH_TRUST_PROXY === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null : null;
    const limit = await checkLoginLimit(email, mode, network);
    if (!limit.allowed) {
      await db.loginAudit.create({ data: { mode, result: "RATE_LIMITED" } });
      return apiJson({ message: "Too many login attempts. Please try again later.", retryAfter: limit.retryAfter }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    }
    let user: { id: string } | null = null;
    if (mode === "LOCAL") {
      const local = await db.user.findUnique({ where: { localUsername: email.toLowerCase(), provider: "LOCAL" }, select: { id: true, passwordHash: true, isActive: true, roles: { select: { role: { select: { code: true } } } } } });
      const valid = Buffer.byteLength(password, "utf8") <= 72 && await compare(password, local?.passwordHash ?? await dummyHash);
      if (valid && local?.passwordHash && local.isActive && local.roles.some((entry) => ["ADMIN", "STOREMAN", "USER"].includes(entry.role.code))) user = { id: local.id };
    } else {
      let directoryUser;
      try { directoryUser = await authenticateWithLdap(email, password); }
      catch (error) {
        if (!(error instanceof LdapDirectoryError)) throw error;
        await db.loginAudit.create({ data: { mode, result: "AD_UNAVAILABLE" } });
        return apiJson({ message: "Active Directory is unavailable. Please try again later.", code: "AD_UNAVAILABLE" }, { status: 503 });
      }
      if (directoryUser) {
        const matches = await db.user.findMany({ where: { isActive: true, provider: "AD", localUsername: null, OR: [
          { ldapUsername: { equals: directoryUser.username, mode: "insensitive" } },
          ...(directoryUser.upn ? [{ ldapUpn: { equals: directoryUser.upn, mode: "insensitive" as const } }] : []),
        ] }, select: { id: true }, take: 2 });
        if (matches.length === 1) user = matches[0];
        else {
          await db.loginAudit.create({ data: { mode, result: "AD_MAPPING_DENIED" } });
          return apiJson({ message: "Account mapping is missing or ambiguous. Please contact the administrator.", code: "AD_MAPPING_REQUIRED" }, { status: 403 });
        }
      }
    }

    if (!user) {
      await db.loginAudit.create({ data: { mode, result: "DENIED" } });
      return apiJson(
        { message: "Invalid credentials or account unavailable." },
        { status: 401 },
      );
    }

    await db.loginAudit.create({ data: { userId: user.id, mode, result: "SUCCESS" } });
    await db.loginThrottle.deleteMany({ where: { key: limit.accountKey } });

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = createSessionToken(user.id);
    const currentUser = await getUserFromSessionToken(token);
    const response = apiJson({ user: currentUser });

    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

    return response;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return apiJson(
        { message: "Database is unavailable. Start PostgreSQL and try again." },
        { status: 503 },
      );
    }

    return apiErrorResponse(error);
  }
}

