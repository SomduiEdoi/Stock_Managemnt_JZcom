import { describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

describe("session tokens", () => {
  it("verifies a signed session token", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");

    const token = createSessionToken("user-1", 1_000);
    const session = verifySessionToken(token, 2_000);

    expect(session?.userId).toBe("user-1");

    vi.unstubAllEnvs();
  });

  it("rejects a tampered token", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");

    const token = createSessionToken("user-1", 1_000);
    const [, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        userId: "admin-1",
        issuedAt: 1_000,
        expiresAt: 60 * 60 * 8 * 1000,
      }),
      "utf8",
    ).toString("base64url");
    const tampered = `${tamperedPayload}.${signature}`;

    expect(verifySessionToken(tampered, 2_000)).toBeNull();

    vi.unstubAllEnvs();
  });

  it("rejects an expired token", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");

    const token = createSessionToken("user-1", 1_000);

    expect(verifySessionToken(token, 60 * 60 * 9 * 1000)).toBeNull();

    vi.unstubAllEnvs();
  });
});
