import { PrismaClient } from "@prisma/client";
import { findDirectApprover } from "../src/lib/direct-reporting";
const db = new PrismaClient();
async function main() {
  const rows = await db.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, organizationLevel: true, organizationAssignments: { where: { isActive: true, isPrimary: true }, select: { team: true, organizationLevel: true } } } });
    const result = [];
    for (const user of users) {
      const assignment = user.organizationAssignments[0];
      if (!assignment && !user.organizationLevel) { result.push({ name: user.name, team: "", level: "", approver: "Unassigned organization" }); continue; }
      try {
        const head = await findDirectApprover(tx, user.id);
        result.push({ name: user.name, team: assignment?.team ?? "", level: assignment?.organizationLevel ?? user.organizationLevel, approver: head?.approvers[0].name ?? "Executive: no higher step" });
      } catch (error) { result.push({ name: user.name, team: assignment?.team ?? "", level: assignment?.organizationLevel ?? user.organizationLevel, approver: error instanceof Error ? error.message : "Unresolved" }); }
    }
    return result;
  }, { timeout: 30_000 });
  console.table(rows);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Report failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
