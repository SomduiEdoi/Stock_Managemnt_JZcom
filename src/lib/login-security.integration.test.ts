import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkLoginLimit } from "./login-security";

const enabled = process.env.RUN_POSTGRES_AUTH_TESTS === "1";
afterAll(async () => { if (enabled) await db.$disconnect(); });
describe.skipIf(!enabled)("PostgreSQL login limiter", () => {
  it("atomically admits only five concurrent attempts for one account", async () => {
    const identifier = `qa-auth-${randomUUID()}`;
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const keys = [`account:${hash(`LOCAL:${identifier}`)}`, `network:${hash(identifier)}`];
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => checkLoginLimit(identifier, "LOCAL", identifier)));
      expect(results.filter((result) => result.allowed)).toHaveLength(5);
      expect(results.filter((result) => !result.allowed)).toHaveLength(3);
      expect((await checkLoginLimit(identifier, "LOCAL", identifier)).allowed).toBe(false);
    } finally {
      await db.loginThrottle.deleteMany({ where: { key: { in: keys } } });
    }
  });
});
