import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { findDirectApprover } from "./direct-reporting";
const enabled = process.env.RUN_POSTGRES_WORKFLOW_TESTS === "1";
const db = enabled ? new PrismaClient() : null;
afterAll(async () => db?.$disconnect());
describe.skipIf(!enabled)("organization matrix on PostgreSQL", () => {
  it("never skips an empty direct role, rejects ambiguity and bypasses root roles", async () => {
    const marker = `QA-ORG-${randomUUID()}`;
    const rollback = new Error("EXPECTED_ROLLBACK");
    await expect(db!.$transaction(async (tx) => {
      // All temporary changes, including isolation from real managers, roll back.
      await tx.user.updateMany({ where: { OR: [
        { organizationTag: "SYSTEM_ENGINEER" },
        { organizationAssignments: { some: { organizationTag: "SYSTEM_ENGINEER" } } },
      ] }, data: { isActive: false } });
      const requester = await tx.user.create({ data: { name: marker, organizationAssignments: { create: { team: "SYSTEM", organizationLevel: "STAFF", organizationTag: "SYSTEM_HELP_DESK", isPrimary: true } } } });
      await tx.user.create({ data: { name: `${marker}-solution`, organizationTag: "SOLUTION_ASST_MANAGER" } });
      await expect(findDirectApprover(tx, requester.id)).rejects.toMatchObject({ code: "SUPERVISOR_NOT_CONFIGURED" });
      const engineer = await tx.user.create({ data: { name: `${marker}-engineer`, organizationAssignments: { create: { team: "SYSTEM", organizationLevel: "SUPERVISOR", organizationTag: "SYSTEM_ENGINEER", isPrimary: true } } } });
      expect((await findDirectApprover(tx, requester.id))?.approvers.map((head) => head.id)).toEqual([engineer.id]);
      await tx.user.create({ data: { name: `${marker}-duplicate`, organizationTag: "SYSTEM_ENGINEER" } });
      await expect(findDirectApprover(tx, requester.id)).rejects.toMatchObject({ code: "AMBIGUOUS_SUPERVISOR" });
      for (const tag of ["SERVICE_MANAGER", "DELIVERY_CLIENT_MANAGER", "BSD_HELP_DESK"] as const) {
        const root = await tx.user.create({ data: { name: `${marker}-${tag}`, organizationTag: tag } });
        expect(await findDirectApprover(tx, root.id)).toBeNull();
      }
      throw rollback;
    }, { timeout: 20000 })).rejects.toBe(rollback);
    expect(await db!.user.count({ where: { name: { startsWith: marker } } })).toBe(0);
  });
});
