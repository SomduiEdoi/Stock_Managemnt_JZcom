import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { findDirectApprover } from "../src/lib/direct-reporting";

const db = new PrismaClient();
async function main() {
  const mode = process.argv[2];
  if (!["--backup", "--preview", "--apply"].includes(mode)) throw new Error("Use --backup, --preview, or --apply.");
  if (mode === "--backup") {
    const snapshot = await db.$transaction(async (tx) => ({
      users: await tx.$queryRaw`SELECT id, name, email, is_active, organization_tag::text, organization_level::text FROM users`,
      assignments: await tx.$queryRaw`SELECT * FROM user_organization_assignments`,
      approvals: await tx.$queryRaw`SELECT * FROM transaction_approvals`,
      permissions: await tx.userWarehousePermission.findMany(),
    }));
    await mkdir(".artifacts", { recursive: true });
    const path = `.artifacts/organization-before-${Date.now()}.json`;
    await writeFile(path, JSON.stringify(snapshot, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ backup: path }));
    return;
  }
  const previewRollback = new Error("PREVIEW_ROLLBACK");
  let result: unknown;
  try {
    await db.$transaction(async (tx) => {
      const pending = await tx.transactionApproval.findMany({
        where: { isCurrent: true, status: "PENDING" },
        distinct: ["transactionId", "resolutionBatchId"],
        select: { transactionId: true, resolutionBatchId: true },
      });
      const changes: unknown[] = [];
      for (const group of pending) {
        const transaction = await tx.transaction.findUniqueOrThrow({ where: { id: group.transactionId }, select: {
          transactionNo: true, requestedById: true, workflowStatus: true, sourceTransactionId: true, projectRequest: true,
          requestedBy: { select: { isActive: true, name: true } },
        } });
        if (!transaction.requestedBy.isActive) {
          changes.push({ request: transaction.transactionNo, skipped: "Inactive requester; history preserved" });
          continue;
        }
        if (group.resolutionBatchId) {
          const batch = await tx.returnBatch.findUnique({ where: { id: group.resolutionBatchId }, select: { state: true } });
          if (batch && batch.state !== "SUBMITTED") continue;
        } else if (transaction.workflowStatus !== "PENDING" || transaction.sourceTransactionId) continue;
        const rows = await tx.transactionApproval.findMany({ where: { ...group, isCurrent: true }, orderBy: { stepSequence: "asc" } });
        const old = rows.filter((row) => row.requiredTag === "DIRECT_MANAGER" || row.requiredTag.endsWith("_SUPERVISOR"));
        // Project-lead approval remains a separate, explicit project assignment.
        if (!old.length && transaction.projectRequest) continue;
        const next = await findDirectApprover(tx, transaction.requestedById);
        const nextUser = next?.approvers[0];
        if (old.length === 1 && nextUser && old[0].userId === nextUser.id && old[0].requiredTag === "DIRECT_MANAGER") continue;
        if (!old.length && !nextUser) continue;
        let sequence = old[0]?.stepSequence;
        if (!sequence && nextUser) {
          const firstStore = rows.find((row) => row.requiredTag.startsWith("STOREMAN:") || row.requiredTag.startsWith("RETURN_CHECK:"));
          if (!firstStore) throw new Error(`No Storeman step exists for ${transaction.transactionNo}`);
          sequence = firstStore.stepSequence;
          await tx.transactionApproval.updateMany({ where: { ...group, isCurrent: true, stepSequence: { gte: sequence } }, data: { stepSequence: { increment: 1 } } });
        }
        await tx.transactionApproval.updateMany({ where: { id: { in: old.map((row) => row.id) } }, data: { isCurrent: false } });
        if (nextUser) await tx.transactionApproval.create({ data: {
          ...group, userId: nextUser.id, requiredTag: "DIRECT_MANAGER", stepSequence: sequence!,
          approverNameSnapshot: nextUser.name, approverTagSnapshot: "DIRECT_MANAGER", status: "PENDING",
        } });
        changes.push({ request: transaction.transactionNo, batch: group.resolutionBatchId, requester: transaction.requestedBy.name, next: nextUser?.name ?? "Storeman", archivedApprovals: old.length });
      }
      result = { applied: mode === "--apply", changes };
      if (mode !== "--apply") throw previewRollback;
    }, { isolationLevel: "Serializable", timeout: 60000 });
  } catch (error) { if (error !== previewRollback) throw error; }
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Organization rollout failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
