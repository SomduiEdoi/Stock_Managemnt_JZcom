import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("./db", () => ({ db: { $transaction: mocks.transaction, $disconnect: vi.fn() } }));
import { AUTHORIZED_RETURN, approvedPlanFromSnapshot, authorizedReturnStatus, buildPendingReturnReport, invokeApprovedReturnMigration, validatePendingReturnPlan, verifyApprovedReturnUnchanged, runPendingReturnReport, type PendingReturnSnapshot } from "../../scripts/migrate-pending-return-batches";

const batchId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-10-05T07:00:00Z");
function fixture(): PendingReturnSnapshot {
  return {
    outcomes: [{ id: "outcome", transaction_item_id: "item", transaction_id: "source", resolution_batch_id: batchId, approved_at: null, quantity: 3, outcome_status: "READY", return_condition: "NEW", updated_at: "2026-10-01T00:00:00Z" }],
    items: [{ id: "item", transaction_id: "source", asset_id: "asset", asset_model_id: "model", requested_quantity: 10 }],
    transactions: [{ id: "source", transaction_no: "REQ-20261001-01", workflow_status: "COMPLETED", source_transaction_id: null }],
    approvals: [{ id: "lead", transaction_id: "source", resolution_batch_id: batchId, approval_required_tag: "INSTALLATION_SUPERVISOR", approval_status: "APPROVED", user_id: "lead-user" }],
    batches: [], checks: [], assets: [{ id: "asset", asset_model_id: "model", warehouse_id: "warehouse", asset_quantity: 17 }], models: [{ id: "model", is_serialized: false }],
    warehouses: [{ id: "warehouse", code: "INSTALLATION" }], histories: [{ id: "issued", asset_id: "asset", quantity_before: 27, quantity_after: 17, quantity_changed: -10 }],
  };
}
const report = (snapshot: PendingReturnSnapshot) => buildPendingReturnReport(snapshot, now);

describe("pending return migration report", () => {
  it("preserves batch identity, approved supervisor, historical items and issued quantities without mutation", () => {
    const snapshot = fixture();
    const before = JSON.stringify(snapshot);
    const result = report(snapshot);
    expect(result.applyAllowed).toBe(false);
    expect(result.groups[0]).toMatchObject({ proposedReturnBatchId: batchId, preservedLeadApprovalIds: ["lead"], decision: "REQUIRES_APPROVED_MANUAL_RESTART_PLAN" });
    expect(result.groups[0].outcomes[0]).toMatchObject({ quantity: 3, currentAssetQuantity: 17, assetId: "asset", assetModelId: "model" });
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("excludes posted outcomes entirely from proposed migration", () => {
    const snapshot = fixture();
    snapshot.outcomes[0].approved_at = "2026-10-02T00:00:00Z";
    expect(report(snapshot)).toMatchObject({ pendingOutcomeCount: 0, excludedPostedOutcomeCount: 1, groups: [] });
  });
  it("blocks a mixed posted/unposted batch", () => {
    const snapshot = fixture();
    snapshot.outcomes.push({ ...snapshot.outcomes[0], id: "posted", approved_at: "2026-10-02T00:00:00Z" });
    expect(report(snapshot).groups[0]).toMatchObject({ decision: "BLOCKED_MANUAL_REVIEW", pendingOutcomeIds: ["outcome"], excludedPostedOutcomeIds: ["posted"] });
  });
  it("never generates or guesses a batch UUID for unassigned outcomes", () => {
    const snapshot = fixture();
    snapshot.outcomes[0].resolution_batch_id = null;
    const group = report(snapshot).groups[0];
    expect(group.proposedReturnBatchId).toBeNull();
    expect(group.preservedLeadApprovalIds).toEqual([]);
    expect(group.reasons.join(" ")).toContain("stable new UUID");
    expect(report(snapshot).revision).toBe(report(snapshot).revision);
  });
  it("never borrows source issuance or another batch's Lead approval", () => {
    const snapshot = fixture();
    snapshot.approvals[0].resolution_batch_id = null;
    snapshot.approvals.push({ ...snapshot.approvals[0], id: "other", resolution_batch_id: "other-batch" });
    expect(report(snapshot).groups[0].preservedLeadApprovalIds).toEqual([]);
  });
  it("blocks old warehouse approvals for a different outcome warehouse", () => {
    const snapshot = fixture();
    snapshot.approvals.push({ ...snapshot.approvals[0], id: "wrong-warehouse", approval_required_tag: "STOREMAN:SERVER" });
    expect(report(snapshot).groups[0].reasons.join(" ")).toContain("Warehouse approval scope differs");
  });
  it("preserves old approved Storeman rows as history, not new CHECK/final validity", () => {
    const snapshot = fixture();
    snapshot.approvals.push({ ...snapshot.approvals[0], id: "storeman", approval_required_tag: "STOREMAN:INSTALLATION" });
    const group = report(snapshot).groups[0];
    expect(group.legacyApprovedStoremanIds).toEqual(["storeman"]);
    expect(group.checkEvidence[0].proposedStatus).toBe("PENDING_NEW_CHECK");
    expect(group.proposedPhases[0].finalStatus).toBe("PENDING_NEW_ROUND");
    expect(group.decision).toBe("BLOCKED_MANUAL_REVIEW");
  });
  it("accepts only explicit complete timely check evidence on an existing batch", () => {
    const snapshot = fixture();
    snapshot.batches.push({ id: batchId, transaction_id: "source", request_no: "REQ-20261002-02", state: "SUBMITTED" });
    snapshot.approvals.push({ ...snapshot.approvals[0], id: "check", user_id: "storeman", approval_required_tag: "RETURN_CHECK:INSTALLATION", approval_acted_at: "2026-10-03T00:00:00Z" });
    expect(report(snapshot).groups[0].checkEvidence[0].verifiedApprovalIds).toEqual([]);
    snapshot.checks.push({ id: "evidence", outcome_id: "outcome", user_id: "storeman", checked_at: "2026-10-02T00:00:00Z" });
    expect(report(snapshot).groups[0].checkEvidence[0].verifiedApprovalIds).toEqual(["check"]);
    snapshot.checks[0].checked_at = "2026-09-30T00:00:00Z";
    expect(report(snapshot).groups[0].checkEvidence[0].verifiedApprovalIds).toEqual([]);
  });
  it("ignores superseded check and Lead approvals but retains historical IDs", () => {
    const snapshot = fixture();
    snapshot.approvals[0].is_current = false;
    snapshot.approvals[0].approval_comment = "Superseded approval revision";
    expect(report(snapshot).groups[0]).toMatchObject({ preservedLeadApprovalIds: [], historicalApprovalIds: ["lead"] });
  });
  it("uses is_current rather than comments, preserving legacy missing-boolean compatibility", () => {
    const snapshot = fixture();
    snapshot.approvals[0].approval_comment = "Superseded approval revision";
    expect(report(snapshot).groups[0].preservedLeadApprovalIds).toEqual(["lead"]);
    snapshot.approvals[0].is_current = true;
    expect(report(snapshot).groups[0].preservedLeadApprovalIds).toEqual(["lead"]);
    snapshot.approvals[0].is_current = false;
    snapshot.approvals[0].approval_comment = "Original reviewer comment";
    const group = report(snapshot).groups[0];
    expect(group.preservedLeadApprovalIds).toEqual([]);
    expect(group.historicalApprovals[0]).toMatchObject({ isCurrent: false, comment: "Original reviewer comment" });
    expect(snapshot.approvals[0].approval_comment).toBe("Original reviewer comment");
  });
  it.each(["COMPLETED", "CANCELLED", "REJECTED"])("does not reopen %s batches", state => {
    const snapshot = fixture();
    snapshot.batches.push({ id: batchId, transaction_id: "source", state });
    expect(report(snapshot).groups[0].reasons.join(" ")).toContain("do not reopen");
  });
  it("blocks existing derived sales instead of reposting source or sale stock", () => {
    const snapshot = fixture();
    snapshot.outcomes[0].sold_transaction_id = "sale";
    expect(report(snapshot).groups[0].reasons.join(" ")).toContain("Existing derived sale");
  });
  it("blocks ambiguous return conditions, invalid quantities, and missing assets", () => {
    const snapshot = fixture();
    snapshot.outcomes[0].return_condition = null;
    snapshot.outcomes[0].quantity = -1;
    expect(report(snapshot).groups[0].reasons.join(" ")).toMatch(/NEW\/USED/);
    expect(report(snapshot).groups[0].reasons.join(" ")).toContain("Invalid quantity");
    snapshot.assets = [];
    expect(report(snapshot).groups[0].reasons.join(" ")).toContain("Missing item/asset/warehouse");
  });
  it("previews monthly numbering without allocation and respects the limit", () => {
    const snapshot = fixture();
    expect(report(snapshot).requestNumberReview.nextPreviewOnly).toBe("REQ-20261005-02");
    snapshot.transactions = Array.from({ length: 99 }, (_, i) => ({ id: `source-${i}`, transaction_no: `REQ-20261001-${i}` }));
    expect(report(snapshot).requestNumberReview.nextPreviewOnly).toBeNull();
  });
  it("changes the report revision when history or pending membership changes", () => {
    const snapshot = fixture();
    const revision = report(snapshot).revision;
    snapshot.histories.push({ id: "new-history" });
    expect(report(snapshot).revision).not.toBe(revision);
  });
});

describe("report CLI safety", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects apply before accessing the database", async () => {
    await expect(runPendingReturnReport(["--apply"])).rejects.toThrow(/Apply is disabled/);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("defaults to a repeatable-read read-only transaction without mutation/number allocation", async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(0), $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    mocks.transaction.mockImplementation(callback => callback(tx));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runPendingReturnReport([]);
    expect(result).toMatchObject({ pendingOutcomeCount: 0 });
    expect(tx.$executeRawUnsafe.mock.calls).toEqual([["SET TRANSACTION READ ONLY"]]);
    expect(tx.$queryRawUnsafe.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
    expect(mocks.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "RepeatableRead" });
    log.mockRestore();
  });
});

function authorizedFixture() {
  const snapshot = fixture();
  snapshot.transactions[0].id = AUTHORIZED_RETURN.transactionId;
  snapshot.transactions[0].transaction_no = AUTHORIZED_RETURN.sourceRequestNo;
  snapshot.transactions[0].requested_by = "44444444-4444-4444-8444-444444444444";
  Object.assign(snapshot.outcomes[0], { id: AUTHORIZED_RETURN.outcomeId, transaction_id: AUTHORIZED_RETURN.transactionId, resolution_batch_id: AUTHORIZED_RETURN.batchId, return_condition: null });
  Object.assign(snapshot.items[0], { transaction_id: AUTHORIZED_RETURN.transactionId, asset_id: AUTHORIZED_RETURN.assetId, requested_quantity: 3, dispatched_at: AUTHORIZED_RETURN.dispatchedAt });
  Object.assign(snapshot.assets[0], { id: AUTHORIZED_RETURN.assetId, stock_code: AUTHORIZED_RETURN.stockCode, condition: "NEW" });
  Object.assign(snapshot.approvals[0], { transaction_id: AUTHORIZED_RETURN.transactionId, resolution_batch_id: AUTHORIZED_RETURN.batchId, approval_status: "PENDING", is_current: true });
  return snapshot;
}

describe("exact user-authorized RETURN NEW migration", () => {
  beforeEach(() => vi.resetAllMocks());
  it("reports completed backfill as awaiting normal approval, never eligible for rerun", () => {
    const snapshot = authorizedFixture();
    snapshot.batches.push({ id: AUTHORIZED_RETURN.batchId, transaction_id: AUTHORIZED_RETURN.transactionId, request_no: "REQ-20261005-06" });
    Object.assign(snapshot.outcomes[0], { return_condition: "NEW", asset_id: AUTHORIZED_RETURN.assetId });
    const before = JSON.stringify(snapshot);
    expect(authorizedReturnStatus(snapshot)).toMatchObject({ status: "BACKFILLED_AWAITING_NORMAL_APPROVAL", requestNo: "REQ-20261005-06", currentOnHand: 17, returnQuantity: 3, returnCondition: "NEW", outcomePosted: false, migrationRerunAllowed: false });
    expect(() => approvedPlanFromSnapshot(snapshot)).toThrow(/already exists/);
    expect(JSON.stringify(snapshot)).toBe(before);
    snapshot.outcomes[0].approved_at = "2026-10-06T00:00:00Z";
    snapshot.assets[0].asset_quantity = 20;
    expect(authorizedReturnStatus(snapshot)).toMatchObject({ status: "POSTED_AFTER_BACKFILL", currentOnHand: 20, migrationRerunAllowed: false });
  });
  it("builds only the approved pair with original requester, qty3, code and condition", () => {
    const snapshot = authorizedFixture();
    const plan = approvedPlanFromSnapshot(snapshot);
    expect(plan).toMatchObject({ batchId: AUTHORIZED_RETURN.batchId, outcomeId: AUTHORIZED_RETURN.outcomeId, quantity: 3, condition: "NEW", originalStockCode: "IN-LA-PCL0019", actorId: snapshot.transactions[0].requested_by });
    expect(() => validatePendingReturnPlan({ ...plan, batchId: AUTHORIZED_RETURN.excludedBatchId }, snapshot)).toThrow();
    expect(() => validatePendingReturnPlan({ ...plan, condition: "USED" }, snapshot)).toThrow();
  });
  it.each([{ asset_quantity: 18 }, { stock_code: "OTHER" }, { condition: "USED" }])("rejects original stock changes %j", change => {
    const snapshot = authorizedFixture();
    Object.assign(snapshot.assets[0], change);
    expect(() => approvedPlanFromSnapshot(snapshot)).toThrow(/stock identity/);
  });
  it.each([{ requested_quantity: 4 }, { dispatched_at: null }, { dispatched_at: "2026-10-02T03:28:43.501Z" }])("rejects original issuance changes %j", change => {
    const snapshot = authorizedFixture();
    Object.assign(snapshot.items[0], change);
    expect(() => approvedPlanFromSnapshot(snapshot)).toThrow(/stock identity/);
  });
  it("rejects posted outcomes, stale plans, and existing numbered batches", () => {
    const snapshot = authorizedFixture();
    const plan = approvedPlanFromSnapshot(snapshot);
    snapshot.histories.push({ id: "later" });
    expect(() => validatePendingReturnPlan(plan, snapshot)).toThrow(/Snapshot changed/);
    snapshot.outcomes[0].approved_at = "2026-10-05T00:00:00Z";
    expect(() => approvedPlanFromSnapshot(snapshot)).toThrow(/posted/);
    snapshot.outcomes[0].approved_at = null;
    snapshot.batches.push({ id: AUTHORIZED_RETURN.batchId });
    expect(() => approvedPlanFromSnapshot(snapshot)).toThrow(/already exists/);
  });
  it("delegates the exact signature and verifies zero posted quantity / onhand17", async () => {
    const before = authorizedFixture();
    const after = structuredClone(before);
    Object.assign(after.outcomes[0], { return_condition: "NEW", asset_id: AUTHORIZED_RETURN.assetId });
    after.approvals.push(...["RETURN_CHECK:INSTALLATION", "STOREMAN:INSTALLATION"].map((tag, i) => ({ id: `new-${i}`, transaction_id: AUTHORIZED_RETURN.transactionId, resolution_batch_id: AUTHORIZED_RETURN.batchId, is_current: true, approval_required_tag: tag, approval_status: "PENDING" })));
    after.batches.push({ id: AUTHORIZED_RETURN.batchId, transaction_id: AUTHORIZED_RETURN.transactionId, request_no: "REQ-20261005-06" });
    const tables: Record<string, keyof PendingReturnSnapshot> = { return_batches: "batches", transaction_item_outcomes: "outcomes", transaction_items: "items", transactions: "transactions", transaction_approvals: "approvals", return_outcome_checks: "checks", assets: "assets", asset_models: "models", asset_warehouses: "warehouses", asset_status_histories: "histories" };
    let calls = 0;
    mocks.transaction.mockImplementation(callback => {
      const snapshot = calls++ === 0 ? before : after;
      return callback({ $executeRawUnsafe: vi.fn().mockResolvedValue(0), $queryRawUnsafe: vi.fn().mockImplementation((sql: string) => {
        const table = Object.keys(tables).find(name => sql.includes(`FROM ${name} `) || sql.includes(`FROM ${name})`))!;
        return snapshot[tables[table]].map(row => ({ row }));
      }) });
    });
    const helper = vi.fn().mockResolvedValue({ requestNo: "REQ-20261005-06" });
    const result = await invokeApprovedReturnMigration(helper);
    expect(helper).toHaveBeenCalledWith(AUTHORIZED_RETURN.transactionId, AUTHORIZED_RETURN.batchId, [AUTHORIZED_RETURN.outcomeId], { [AUTHORIZED_RETURN.outcomeId]: "NEW" });
    expect(result).toMatchObject({ onHandBefore: 17, onHandAfter: 17, quantityPostedNow: 0, expectedOnHandAfterFutureFinalReturn: 20 });
  });
  it("detects stock or posted-history replay in postflight without claiming rollback", () => {
    const before = authorizedFixture();
    const after = structuredClone(before);
    after.assets[0].asset_quantity = 20;
    expect(() => verifyApprovedReturnUnchanged(before, after)).toThrow(/helper may have committed/);
    after.assets[0].asset_quantity = 17;
    after.histories.push({ id: "replayed" });
    expect(() => verifyApprovedReturnUnchanged(before, after)).toThrow(/histories/);
  });
});
