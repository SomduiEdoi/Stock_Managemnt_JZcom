import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { findDirectApprover } from "./direct-reporting";
const enabled = process.env.RUN_POSTGRES_WORKFLOW_TESTS === "1";
const db = enabled ? new PrismaClient() : null;
afterAll(async () => db?.$disconnect());
describe.skipIf(!enabled)("automatic organization routing on PostgreSQL", () => {
  it("skips empty roles, ignores other branches/inactive users and resolves one real head", async () => {
    const marker = `QA-ORG-${randomUUID()}`;
    const rollback = new Error("EXPECTED_ROLLBACK");
    await expect(db!.$transaction(async (tx) => {
      const requester = await tx.user.create({ data: { name: marker, organizationAssignments: { create: { team: "SYSTEM", organizationLevel: "STAFF", organizationTag: "S1_STAFF", isPrimary: true } } } });
      await tx.user.create({ data: { name: `${marker}-other-branch`, organizationAssignments: { create: { team: "NETWORK", organizationLevel: "SUPERVISOR", organizationTag: "N1_SUPERVISOR", isPrimary: true } } } });
      await tx.user.create({ data: { name: `${marker}-inactive`, isActive: false, organizationAssignments: { create: { team: "SYSTEM", organizationLevel: "SUPERVISOR", organizationTag: "S1_SUPERVISOR", isPrimary: true } } } });
      const manager = await tx.user.create({ data: { name: `${marker}-solution`, organizationAssignments: { create: { team: "SOLUTION", organizationLevel: "MANAGER", organizationTag: "SC_MANAGER", isPrimary: true } } } });
      expect((await findDirectApprover(tx, requester.id))?.approvers.map((head) => head.id)).toEqual([manager.id]);
      const service = await tx.user.create({ data: { name: `${marker}-service`, organizationAssignments: { create: { team: "SERVICE", organizationLevel: "MANAGER", organizationTag: "CS_MANAGER", isPrimary: true } } } });
      await tx.user.update({ where: { id: manager.id }, data: { isActive: false } });
      expect((await findDirectApprover(tx, requester.id))?.approvers.map((head) => head.id)).toEqual([service.id]);
      await tx.user.create({ data: { name: `${marker}-duplicate`, organizationAssignments: { create: { team: "SERVICE", organizationLevel: "MANAGER", organizationTag: "CS_MANAGER", isPrimary: true } } } });
      await expect(findDirectApprover(tx, requester.id)).rejects.toMatchObject({ code: "AMBIGUOUS_SUPERVISOR" });
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await db!.user.count({ where: { name: { startsWith: marker } } })).toBe(0);
  });
});
