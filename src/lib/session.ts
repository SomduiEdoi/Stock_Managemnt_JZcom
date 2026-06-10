import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "stock_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required for session signing.");
  }

  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string) {
  const json = Buffer.from(value, "base64url").toString("utf8");
  return JSON.parse(json) as SessionPayload;
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createSessionToken(userId: string, now = Date.now()) {
  const payload = encodePayload({
    userId,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  });

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature || !signaturesMatch(signature, sign(payload))) {
    return null;
  }

  try {
    const session = decodePayload(payload);

    if (!session.userId || session.expiresAt <= now) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function expiredSessionCookieOptions() {
  return {
    ...sessionCookieOptions(),
    maxAge: 0,
  };
}
