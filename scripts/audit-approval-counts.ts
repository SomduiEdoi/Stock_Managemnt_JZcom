import { db } from "../src/lib/db";
import { getPendingApprovalsForUser } from "../src/lib/transaction-log";
import type { CurrentUser } from "../src/lib/auth";

async function main() {
  const users = await db.user.findMany({
    where: { isActive: true },
    include: { organizationAssignments: { where: { isActive: true } }, roles: { include: { role: true } }, warehousePermissions: { include: { warehouse: true } } },
  });
  for (const user of users.filter((user) => /chutithep|tanawat|suriya|^bsd$|surarux/i.test(user.name))) {
    const roles = user.roles.map(({ role }) => role.code);
    if (!roles.includes("ADMIN") && !roles.includes("STOREMAN") && user.warehousePermissions.some((permission) => permission.canManage)) roles.push("STOREMAN");
    const primary = user.organizationAssignments.find((assignment) => assignment.isPrimary) ?? user.organizationAssignments[0];
    const actor = { ...user, email: user.email ?? "", signatureUploadedBy: null, roles, organizationLevel: primary?.organizationLevel ?? user.organizationLevel, organizationTag: primary?.organizationTag ?? user.organizationTag, permissions: user.warehousePermissions.filter((permission) => permission.warehouse.isActive).map((permission) => ({ canManage: permission.canManage, canView: permission.canView, warehouseCode: permission.warehouse.code })) } as CurrentUser;
    const rows = await getPendingApprovalsForUser(actor);
    console.log(JSON.stringify({ name: user.name, roles, approvalCount: rows.length, rows: rows.map((row) => ({ tag: row.requiredTag, transactionId: row.transaction.id })) }));
  }
}

main().finally(() => db.$disconnect());
