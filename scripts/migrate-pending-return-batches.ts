import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../src/lib/db";
import { formatRequisitionDate, monthlyRequisitionPrefix, MONTHLY_REQUISITION_LIMIT } from "../src/lib/requisition-no";

export const AUTHORIZED_RETURN = {
  transactionId: "eab8f974-3825-47c7-8dd7-eb319587ca90",
  sourceRequestNo: "REQ-20261001-03",
  batchId: "6ac12284-81ca-4e51-a08d-04509090cef1",
  outcomeId: "c370f620-a79f-4fe0-856a-42e45f0ed371",
  assetId: "9e37d9b9-417d-4bdd-8f81-c696555aaa4c",
  excludedBatchId: "02d9fb80-46d7-4233-840c-e50f5b355efd",
  stockCode: "IN-LA-PCL0019",
  dispatchedAt: "2026-10-01T03:28:43.501Z",
} as const;

export const pendingReturnPlanSchema = z.object({
  version: z.literal(1), approved: z.literal(true),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  transactionId: z.literal(AUTHORIZED_RETURN.transactionId),
  sourceRequestNo: z.literal(AUTHORIZED_RETURN.sourceRequestNo),
  batchId: z.literal(AUTHORIZED_RETURN.batchId),
  outcomeId: z.literal(AUTHORIZED_RETURN.outcomeId),
  quantity: z.literal(3), condition: z.literal("NEW"),
  originalAssetId: z.literal(AUTHORIZED_RETURN.assetId),
  originalStockCode: z.literal(AUTHORIZED_RETURN.stockCode),
  actorId: z.string().uuid(), authorizationNote: z.string().trim().min(1),
}).strict();
export type PendingReturnPlan = z.infer<typeof pendingReturnPlanSchema>;

export function validatePendingReturnPlan(input: unknown, snapshot: PendingReturnSnapshot) {
  const plan = pendingReturnPlanSchema.parse(input);
  if (plan.revision !== buildPendingReturnReport(snapshot).revision) throw new Error("Snapshot changed; regenerate the scoped plan");
  const source = snapshot.transactions.find(row => row.id === plan.transactionId);
  const outcome = snapshot.outcomes.find(row => row.id === plan.outcomeId);
  const item = snapshot.items.find(row => row.id === outcome?.transaction_item_id);
  const asset = snapshot.assets.find(row => row.id === plan.originalAssetId);
  const model = snapshot.models.find(row => row.id === asset?.asset_model_id);
  if (!source || source.transaction_no !== plan.sourceRequestNo || source.requested_by !== plan.actorId || source.source_transaction_id || ["CANCELLED", "REJECTED", "DRAFT"].includes(value(source.workflow_status))) throw new Error("Source/requester scope does not match authorization");
  if (!outcome || outcome.approved_at != null || outcome.approved_by != null || outcome.transaction_id !== plan.transactionId || outcome.resolution_batch_id !== plan.batchId || outcome.outcome_status !== "READY" || outcome.quantity !== 3 || outcome.sold_transaction_id || ![null, undefined, "NEW"].includes(outcome.return_condition as null | undefined | string)) throw new Error("Outcome is posted, changed, sold, or outside the authorized RETURN NEW scope");
  if (snapshot.outcomes.filter(row => row.resolution_batch_id === plan.batchId).length !== 1) throw new Error("Batch membership changed or includes other/posted outcomes");
  if (snapshot.batches.some(row => row.id === plan.batchId)) throw new Error("ReturnBatch already exists; do not migrate or number twice");
  if (!item || item.transaction_id !== plan.transactionId || item.asset_id !== plan.originalAssetId || item.requested_quantity !== 3 || value(item.dispatched_at).replace(/Z$/, "") !== AUTHORIZED_RETURN.dispatchedAt.replace(/Z$/, "") || !asset || asset.asset_quantity !== 17 || asset.stock_code !== plan.originalStockCode || asset.condition !== "NEW" || model?.is_serialized !== false) throw new Error("Original quantity stock identity/condition changed");
  if (snapshot.checks.some(row => row.outcome_id === plan.outcomeId)) throw new Error("New check evidence exists; requires reconciliation, not restart");
  if (snapshot.approvals.some(row => row.transaction_id === plan.transactionId && row.resolution_batch_id === plan.batchId && row.is_current !== false && row.approval_status === "APPROVED" && Number(row.approval_step_sequence) > 1)) throw new Error("Legacy phase already approved; narrow migration must not replace it");
  return plan;
}

export type ApprovedReturnHelper = (transactionId: string, batchId: string, expectedOutcomeIds: string[], returnConditions: Record<string, "NEW">) => Promise<unknown>;

async function readOnlySnapshot() {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return readPendingReturnSnapshot(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
}

export function approvedPlanFromSnapshot(snapshot: PendingReturnSnapshot): PendingReturnPlan {
  const source = snapshot.transactions.find(row => row.id === AUTHORIZED_RETURN.transactionId);
  return validatePendingReturnPlan({
    version: 1, approved: true, revision: buildPendingReturnReport(snapshot).revision,
    transactionId: AUTHORIZED_RETURN.transactionId, sourceRequestNo: AUTHORIZED_RETURN.sourceRequestNo,
    batchId: AUTHORIZED_RETURN.batchId, outcomeId: AUTHORIZED_RETURN.outcomeId,
    quantity: 3, condition: "NEW", originalAssetId: AUTHORIZED_RETURN.assetId,
    originalStockCode: AUTHORIZED_RETURN.stockCode, actorId: source?.requested_by,
    authorizationNote: "User authorized migration of this unposted batch only: RETURN NEW qty 3 to original IN-LA-PCL0019. Preserve requester, items, posted histories and on-hand 17; receive 3 only after future final approval.",
  }, snapshot);
}

export function authorizedReturnStatus(snapshot: PendingReturnSnapshot) {
  const batch = snapshot.batches.find(row => row.id === AUTHORIZED_RETURN.batchId);
  const outcome = snapshot.outcomes.find(row => row.id === AUTHORIZED_RETURN.outcomeId);
  const asset = snapshot.assets.find(row => row.id === AUTHORIZED_RETURN.assetId);
  const matches = Boolean(batch && batch.transaction_id === AUTHORIZED_RETURN.transactionId && outcome?.transaction_id === AUTHORIZED_RETURN.transactionId && outcome.resolution_batch_id === AUTHORIZED_RETURN.batchId && outcome.quantity === 3 && outcome.return_condition === "NEW" && outcome.asset_id === AUTHORIZED_RETURN.assetId && asset?.stock_code === AUTHORIZED_RETURN.stockCode);
  const status = !batch ? "NOT_BACKFILLED" : !matches ? "EXISTING_BATCH_REQUIRES_REVIEW" : outcome?.approved_at != null ? "POSTED_AFTER_BACKFILL" : "BACKFILLED_AWAITING_NORMAL_APPROVAL";
  return {
    status, requestNo: batch?.request_no ?? null, batchId: AUTHORIZED_RETURN.batchId,
    outcomeId: AUTHORIZED_RETURN.outcomeId, stockCode: asset?.stock_code ?? null,
    currentOnHand: asset?.asset_quantity ?? null, returnQuantity: outcome?.quantity ?? null,
    returnCondition: outcome?.return_condition ?? null, outcomePosted: outcome?.approved_at != null,
    excludedPostedOutcomeCount: snapshot.outcomes.filter(row => row.approved_at != null).length,
    migrationRerunAllowed: false,
    nextAction: batch ? "Do not rerun migration. Continue normal CHECK/final approval for the numbered batch; receive quantity only at final posting. Excluded SOLD batch and master normalization remain unauthorized." : "Review the existing dry-run; no database change is performed by this status report.",
  };
}

export function verifyApprovedReturnUnchanged(before: PendingReturnSnapshot, after: PendingReturnSnapshot) {
  const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  for (const key of ["assets", "items", "models", "warehouses", "histories", "checks"] as const) {
    if (!equal(before[key], after[key])) throw new Error(`Post-migration verification failed: protected ${key} changed; helper may have committed, investigate without replay`);
  }
  for (const outcome of before.outcomes.filter(row => row.id !== AUTHORIZED_RETURN.outcomeId)) {
    if (!equal(outcome, after.outcomes.find(row => row.id === outcome.id))) throw new Error("Post-migration verification failed: excluded/posted outcome changed");
  }
  for (const approval of before.approvals.filter(row => row.resolution_batch_id === AUTHORIZED_RETURN.excludedBatchId)) {
    if (!equal(approval, after.approvals.find(row => row.id === approval.id))) throw new Error("Excluded SOLD batch approval changed");
  }
  for (const approval of before.approvals.filter(row => row.transaction_id === AUTHORIZED_RETURN.transactionId && row.resolution_batch_id === AUTHORIZED_RETURN.batchId)) {
    const next = after.approvals.find(row => row.id === approval.id);
    if (!next || !equal({ ...approval, is_current: next.is_current, updated_at: next.updated_at }, next)) throw new Error("Historical approval comment, status or signature snapshot changed");
  }
  const current = after.approvals.filter(row => row.transaction_id === AUTHORIZED_RETURN.transactionId && row.resolution_batch_id === AUTHORIZED_RETURN.batchId && row.is_current === true);
  for (const tag of ["RETURN_CHECK:INSTALLATION", "STOREMAN:INSTALLATION"]) {
    const phase = current.filter(row => row.approval_required_tag === tag);
    if (!phase.length || phase.some(row => row.approval_status !== "PENDING")) throw new Error("New CHECK and final phases must both be pending");
  }
  for (const batch of before.batches) if (!equal(batch, after.batches.find(row => row.id === batch.id))) throw new Error("Existing ReturnBatch changed");
  const outcome = after.outcomes.find(row => row.id === AUTHORIZED_RETURN.outcomeId);
  if (!outcome || outcome.approved_at != null || outcome.approved_by != null || outcome.quantity !== 3 || outcome.return_condition !== "NEW" || outcome.asset_id !== AUTHORIZED_RETURN.assetId) throw new Error("Authorized outcome was posted or changed incorrectly");
  const batch = after.batches.find(row => row.id === AUTHORIZED_RETURN.batchId);
  if (!batch || batch.transaction_id !== AUTHORIZED_RETURN.transactionId || !/^REQ-\d{8}-\d{2}$/.test(value(batch.request_no))) throw new Error("Numbered authorized ReturnBatch was not created");
}

export async function invokeApprovedReturnMigration(helper: ApprovedReturnHelper) {
  const before = await readOnlySnapshot();
  const plan = approvedPlanFromSnapshot(before);
  // The core helper owns its serializable transaction and monthly number allocator.
  // Preflight is read-only; atomic invariants must also be maintained by that helper.
  const result = await helper(plan.transactionId, plan.batchId, [plan.outcomeId], { [plan.outcomeId]: "NEW" });
  const after = await readOnlySnapshot();
  verifyApprovedReturnUnchanged(before, after);
  return { mode: "apply-approved-return", batchId: plan.batchId, approvedPlan: plan, onHandBefore: 17, onHandAfter: 17, quantityPostedNow: 0, expectedOnHandAfterFutureFinalReturn: 20, result };
}

type Row = { id: string; [key: string]: unknown };
export type PendingReturnSnapshot = {
  outcomes: Row[]; items: Row[]; transactions: Row[]; approvals: Row[];
  batches: Row[]; checks: Row[]; assets: Row[]; models: Row[]; warehouses: Row[]; histories: Row[];
};
const value = (input: unknown) => typeof input === "string" ? input : "";
const activeApproval = (row: Row) => row.is_current !== false;
const time = (input: unknown) => Date.parse(value(input));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonical(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return input;
}

export function buildPendingReturnReport(snapshot: PendingReturnSnapshot, now = new Date()) {
  const byId = (rows: Row[]) => new Map(rows.map(row => [row.id, row]));
  const items = byId(snapshot.items), transactions = byId(snapshot.transactions);
  const assets = byId(snapshot.assets), warehouses = byId(snapshot.warehouses);
  const models = byId(snapshot.models);
  const batches = byId(snapshot.batches);
  const pending = snapshot.outcomes.filter(row => row.approved_at == null);
  // Null IDs are a review bucket, never an inferred return round or generated UUID.
  const grouped = new Map<string, Row[]>();
  for (const row of pending) {
    const item = items.get(value(row.transaction_item_id));
    const source = value(row.transaction_id) || value(item?.transaction_id);
    const key = row.resolution_batch_id ? `batch:${value(row.resolution_batch_id)}` : `unassigned:${source || row.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const groups = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([reviewKey, outcomes]) => {
    const reasons: string[] = [];
    const batchId = value(outcomes[0].resolution_batch_id) || null;
    const sourceIds = [...new Set(outcomes.map(row => value(row.transaction_id) || value(items.get(value(row.transaction_item_id))?.transaction_id)))];
    const transactionId = sourceIds.length === 1 && sourceIds[0] ? sourceIds[0] : null;
    const source = transactionId ? transactions.get(transactionId) : undefined;
    const batch = batchId ? batches.get(batchId) : undefined;
    if (!batchId) reasons.push("Explicit grouping and stable new UUID assignment required; do not merge source-level review bucket automatically");
    else if (!uuid.test(batchId)) reasons.push("Existing resolutionBatchId is not a valid UUID");
    if (!transactionId || !source) reasons.push("Missing or ambiguous source transaction");
    if (source?.source_transaction_id) reasons.push("Derived transaction; manual source/outcome reconciliation required");
    if (source && ["CANCELLED", "REJECTED", "DRAFT"].includes(value(source.workflow_status))) reasons.push("Source workflow is not an issued active source");
    if (batch && batch.transaction_id !== transactionId) reasons.push("ReturnBatch belongs to another transaction");
    if (batch && ["COMPLETED", "CANCELLED", "REJECTED"].includes(value(batch.state))) reasons.push("Existing ReturnBatch is closed; do not reopen");
    const postedInSameBatch = batchId ? snapshot.outcomes.filter(row => row.resolution_batch_id === batchId && row.approved_at != null) : [];
    if (postedInSameBatch.length) reasons.push("Mixed posted/unposted batch; manual split/restart required, never migrate posted outcomes");
    const outcomeDetails = outcomes.map(row => {
      const item = items.get(value(row.transaction_item_id));
      const asset = item ? assets.get(value(item.asset_id)) : undefined;
      const warehouse = asset ? warehouses.get(value(asset.warehouse_id)) : undefined;
      const model = asset ? models.get(value(asset.asset_model_id)) : undefined;
      if (!item || !asset || !warehouse) reasons.push(`Missing item/asset/warehouse for ${row.id}`);
      if (item && item.transaction_id !== transactionId) reasons.push(`Outcome/source-item mismatch for ${row.id}`);
      if (!Number.isInteger(row.quantity) || Number(row.quantity) <= 0) reasons.push(`Invalid quantity for ${row.id}`);
      if (!["READY", "SOLD", "FAIL", "LOST"].includes(value(row.outcome_status))) reasons.push(`Unsupported outcome for ${row.id}`);
      if (row.sold_transaction_id) reasons.push(`Existing derived sale for ${row.id}; manual reconciliation required`);
      if (row.outcome_status === "READY" && (!model || model.is_serialized === false && !["NEW", "USED"].includes(value(row.return_condition)))) reasons.push(`Missing tracking or explicit NEW/USED return condition for ${row.id}; never infer from legacy stock`);
      if (model?.is_serialized === true && row.return_condition === "USED") reasons.push(`Serialized USED return is invalid for ${row.id}`);
      return { outcomeId: row.id, itemId: row.transaction_item_id, assetId: item?.asset_id ?? null, assetModelId: item?.asset_model_id ?? null, warehouseCode: warehouse?.code ?? null, quantity: row.quantity, outcomeStatus: row.outcome_status, returnCondition: row.return_condition, currentAssetQuantity: asset?.asset_quantity ?? null };
    });
    const sameBatchApprovals = batchId && transactionId ? snapshot.approvals.filter(row => row.transaction_id === transactionId && row.resolution_batch_id === batchId) : [];
    const current = sameBatchApprovals.filter(activeApproval);
    const leads = current.filter(row => row.approval_required_tag === "LEAD_PROJECT" || row.approval_required_tag === "SUPERVISOR" || value(row.approval_required_tag).endsWith("_SUPERVISOR"));
    const preservedLeadApprovalIds = leads.filter(row => row.approval_status === "APPROVED").map(row => row.id);
    if (!leads.length) reasons.push("Lead/Supervisor assignment and prior approval scope require explicit review; issued-source approval is not return approval");
    const oldStoreman = current.filter(row => value(row.approval_required_tag).startsWith("STOREMAN:") && row.approval_status === "APPROVED");
    const codes = [...new Set(outcomeDetails.map(row => value(row.warehouseCode)).filter(Boolean))].sort();
    if (current.some(row => ["STOREMAN:", "RETURN_CHECK:"].some(prefix => value(row.approval_required_tag).startsWith(prefix)) && !codes.includes(value(row.approval_required_tag).split(":")[1]))) reasons.push("Warehouse approval scope differs from outcome warehouses; do not reuse or retag legacy approvals");
    const checkEvidence = codes.map(code => {
      const ownOutcomeIds = new Set(outcomeDetails.filter(row => row.warehouseCode === code).map(row => row.outcomeId));
      const approvals = current.filter(row => row.approval_required_tag === `RETURN_CHECK:${code}`);
      const verifiedApprovalIds = approvals.filter(row => {
        if (!batch || row.approval_status !== "APPROVED" || !row.user_id || !Number.isFinite(time(row.approval_acted_at))) return false;
        return outcomes.filter(outcome => ownOutcomeIds.has(outcome.id)).every(outcome => snapshot.checks.some(check => check.outcome_id === outcome.id && check.user_id === row.user_id && Number.isFinite(time(check.checked_at)) && time(check.checked_at) >= time(outcome.updated_at ?? outcome.created_at) && time(check.checked_at) <= time(row.approval_acted_at)));
      }).map(row => row.id);
      return { warehouseCode: code, tag: `RETURN_CHECK:${code}`, approvalIds: approvals.map(row => row.id), verifiedApprovalIds, proposedStatus: approvals.length > 0 && verifiedApprovalIds.length === approvals.length ? "PRESERVE_EXPLICIT_CHECK_EVIDENCE" : "PENDING_NEW_CHECK" };
    });
    if (oldStoreman.length) reasons.push("Legacy approved Storeman rows must remain historical; a new CHECK and final approval round needs manual restart, not approval promotion");
    if (batch?.has_signed_pdf || batch?.has_damage_pdf) reasons.push("Existing document evidence must be revision/scope-reviewed; do not reuse automatically");
    return {
      reviewKey, transactionId, sourceRequestNo: source?.transaction_no ?? null,
      resolutionBatchId: batchId, proposedReturnBatchId: batchId, existingRequestNo: batch?.request_no ?? null,
      decision: reasons.length ? "BLOCKED_MANUAL_REVIEW" : batch && checkEvidence.every(row => row.approvalIds.length) ? "EXISTING_NATIVE_BATCH_REVIEW_NO_AUTO_CHANGE" : "REQUIRES_APPROVED_MANUAL_RESTART_PLAN",
      reasons: [...new Set(reasons)], pendingOutcomeIds: outcomes.map(row => row.id), excludedPostedOutcomeIds: postedInSameBatch.map(row => row.id),
      preservedLeadApprovalIds, historicalApprovalIds: sameBatchApprovals.map(row => row.id), legacyApprovedStoremanIds: oldStoreman.map(row => row.id),
      historicalApprovals: sameBatchApprovals.map(row => ({ id: row.id, requiredTag: row.approval_required_tag, status: row.approval_status, userId: row.user_id, actedAt: row.approval_acted_at, comment: row.approval_comment ?? null, isCurrent: activeApproval(row), superseded: !activeApproval(row) })),
      checkEvidence, proposedPhases: codes.map(code => ({ checkTag: `RETURN_CHECK:${code}`, checkStatus: "PENDING_UNLESS_EXPLICIT_VALID_CHECK", finalTag: `STOREMAN:${code}`, finalStatus: "PENDING_NEW_ROUND" })),
      requiresSignedDocument: outcomes.some(row => ["FAIL", "LOST"].includes(value(row.outcome_status)) || row.return_condition === "USED"),
      outcomes: outcomeDetails,
    };
  });
  const prefix = monthlyRequisitionPrefix(now);
  const requestNumbers = [...snapshot.transactions.map(row => value(row.transaction_no)), ...snapshot.batches.map(row => value(row.request_no))].filter(number => number.startsWith(prefix));
  const sorted = Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, [...rows].sort((a, b) => a.id.localeCompare(b.id))]));
  return {
    mode: "dry-run", applyAllowed: false, revision: createHash("sha256").update(JSON.stringify(canonical(sorted))).digest("hex"),
    generatedAt: now.toISOString(), pendingOutcomeCount: pending.length, excludedPostedOutcomeCount: snapshot.outcomes.length - pending.length,
    readOnlyContract: "No stock, history, source transaction, transaction item, approval, outcome, batch or request-number mutation. Posted outcomes and issued stock are never replayed.",
    requestNumberReview: { monthlyPrefix: prefix, existingCount: requestNumbers.length, limit: MONTHLY_REQUISITION_LIMIT, nextPreviewOnly: requestNumbers.length < MONTHLY_REQUISITION_LIMIT ? `REQ-${formatRequisitionDate(now)}-${String(requestNumbers.length + 1).padStart(2, "0")}` : null, helper: "createMonthlyRequisitionNo must allocate atomically only during a separately approved future apply; this preview reserves nothing" },
    decisionsRequired: ["Approve explicit unposted outcome membership and stable UUID assignments for groups without resolutionBatchId", "Confirm current Lead/Supervisor and every warehouse Storeman assignment", "Preserve prior batch-scoped Lead APPROVED rows; never borrow issued-source or other-round approvals", "Keep old Storeman approvals historical, ensure all runtime readers ignore superseded rows, and start new pending CHECK/final phases unless explicit valid new check evidence exists", "Do not reparent historical item fields, reopen closed batches, replay issued stock, or migrate completed outcomes", "Review fresh snapshot before authorizing any migration apply"],
    integrationReviewRequired: "Approval activity uses is_current, not comments. Service/workflow readers now filter isCurrent=true. Verify the workflow owner's in-progress coverage for legacy UUID batches without ReturnBatch records before scoped backfill; keep comments and approval snapshots unchanged.",
    groups,
  };
}

export async function readPendingReturnSnapshot(tx: Prisma.TransactionClient): Promise<PendingReturnSnapshot> {
  const read = async (table: string) => (await tx.$queryRawUnsafe<{ row: Row }[]>(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY id`)).map(result => result.row);
  const batches = (await tx.$queryRawUnsafe<{ row: Row }[]>("SELECT row_to_json(t) AS row FROM (SELECT id, transaction_id, request_no, revision, state, created_at, updated_at, damage_pdf IS NOT NULL AS has_damage_pdf, signed_pdf IS NOT NULL AS has_signed_pdf FROM return_batches) t ORDER BY id")).map(result => result.row);
  return { outcomes: await read("transaction_item_outcomes"), items: await read("transaction_items"), transactions: await read("transactions"), approvals: await read("transaction_approvals"), batches, checks: await read("return_outcome_checks"), assets: await read("assets"), models: await read("asset_models"), warehouses: await read("asset_warehouses"), histories: await read("asset_status_histories") };
}

export async function runPendingReturnReport(args: string[]) {
  if (args.length === 1 && args[0] === "--apply-approved-return") {
    const modulePath = "../src/lib/workflow";
    const workflow = await import(modulePath) as { migrateLegacyReturnBatch?: ApprovedReturnHelper };
    if (typeof workflow.migrateLegacyReturnBatch !== "function") throw new Error("Core migrateLegacyReturnBatch helper is not available");
    const result = await invokeApprovedReturnMigration(workflow.migrateLegacyReturnBatch);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  if (args.some(arg => arg === "--apply")) throw new Error("Apply is disabled for general migration; only --apply-approved-return selects the exact user-authorized RETURN NEW batch");
  if (args.length && !(args.length === 1 && args[0] === "--dry-run")) throw new Error("Usage: tsx scripts/migrate-pending-return-batches.ts [--dry-run | --apply-approved-return]");
  const report = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const snapshot = await readPendingReturnSnapshot(tx);
    const report = buildPendingReturnReport(snapshot);
    let authorizedScopedPlan: PendingReturnPlan | null = null;
    let authorizedScopeError: string | null = null;
    const authorizedMigrationStatus = authorizedReturnStatus(snapshot);
    if (authorizedMigrationStatus.status === "NOT_BACKFILLED") {
      try { authorizedScopedPlan = approvedPlanFromSnapshot(snapshot); }
      catch (error) { authorizedScopeError = error instanceof Error ? error.message : String(error); }
    }
    return { ...report, authorizedCommand: authorizedScopedPlan ? "--apply-approved-return" : null, authorizedScopedPlan, authorizedScopeError, authorizedMigrationStatus, excludedFromAuthorization: AUTHORIZED_RETURN.excludedBatchId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPendingReturnReport(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());
}
