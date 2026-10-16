import { beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotRevision, type NormalizationSnapshot } from "./used-model-normalization";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), readFile: vi.fn() }));
vi.mock("./db", () => ({ db: { $transaction: mocks.transaction, $disconnect: vi.fn() } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
import { run } from "../../scripts/report-normalize-used-models";

describe("normalization CLI with mock database only", () => {
  let snapshot: NormalizationSnapshot;
  let tx: {
    $executeRawUnsafe: ReturnType<typeof vi.fn>;
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
    $executeRaw: ReturnType<typeof vi.fn>;
    user: { findUnique: ReturnType<typeof vi.fn> };
    assetStatusHistory: { create: ReturnType<typeof vi.fn> };
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const model = { id: "11111111-1111-4111-8111-111111111111", name: "Cable", description: "Cable", brand: "B", part_no: "P", warehouse_id: "W", is_serialized: false, is_active: true };
    snapshot = { models: [model, { ...model, id: "22222222-2222-4222-8222-222222222222", description: "Cable(Used)" }], assets: [{ id: "33333333-3333-4333-8333-333333333333", asset_model_id: "22222222-2222-4222-8222-222222222222", warehouse_id: "W", stock_code: "CODE", asset_quantity: 3, condition: "NEW", status: "READY" }], items: [], transactions: [], reservations: [], histories: [] };
    const tables: Record<string, keyof NormalizationSnapshot> = { asset_models: "models", assets: "assets", transaction_items: "items", transactions: "transactions", asset_reservations: "reservations", asset_status_histories: "histories" };
    tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(0), $queryRawUnsafe: vi.fn().mockImplementation((sql: string) => snapshot[tables[sql.match(/FROM (\w+)/)![1]]].map(row => ({ row }))), $executeRaw: vi.fn().mockResolvedValue(1), user: { findUnique: vi.fn().mockResolvedValue({ id: "actor" }) }, assetStatusHistory: { create: vi.fn().mockResolvedValue({}) } };
    mocks.transaction.mockImplementation(async callback => callback(tx));
    mocks.readFile.mockImplementation(async () => JSON.stringify({ version: 1, approved: true, revision: snapshotRevision(snapshot), actorId: "44444444-4444-4444-8444-444444444444", reason: "Explicit review", pairs: [{ usedModelId: snapshot.models[1].id, newModelId: snapshot.models[0].id }] }));
  });
  it("defaults to read-only and never invokes mutation delegates", async () => {
    await run([]);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith("SET TRANSACTION READ ONLY");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assetStatusHistory.create).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it.each([["--apply"], ["--mapping", "file"], ["--dry-run", "--apply"]])("rejects incomplete/unrecognized arguments %j", async (...args) => {
    await expect(run(args)).rejects.toThrow(/Usage/);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("locks before reading, updates model+condition together, appends audit, archives without deletion", async () => {
    await run(["--apply", "--mapping", "mock.json"]);
    expect(tx.$executeRawUnsafe.mock.calls[1][0]).toContain("LOCK TABLE");
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[1]).toBeLessThan(tx.$queryRawUnsafe.mock.invocationCallOrder[0]);
    const sql = tx.$executeRaw.mock.calls.map(call => call[0].join("?")).join("\n");
    expect(sql).toContain("asset_model_id = ?::uuid, condition = 'USED'");
    expect(sql).toContain("is_active = false");
    expect(sql).not.toMatch(/DELETE|stock_code\s*=|asset_quantity\s*=/i);
    const audit = tx.assetStatusHistory.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ assetId: snapshot.assets[0].id, fromStatus: "READY", toStatus: "READY", condition: "USED", stockCode: "CODE", quantityBefore: 3, quantityAfter: 3, quantityChanged: 0 });
    expect(JSON.parse(audit.note)).toMatchObject({ oldModelId: snapshot.models[1].id, newModelId: snapshot.models[0].id, oldCondition: "NEW", stockCode: "CODE" });
  });
  it("does not replay posted quantities or reparent historical item fields", async () => {
    snapshot.histories.push({ id: "posted-history", asset_id: snapshot.assets[0].id, transaction_id: "completed", quantity_before: 10, quantity_after: 3, quantity_changed: -7, stock_code: "CODE", condition: "NEW" });
    snapshot.transactions.push({ id: "completed", workflow_status: "COMPLETED" });
    snapshot.items.push({ id: "historical-item", asset_id: snapshot.assets[0].id, asset_model_id: snapshot.models[1].id, transaction_id: "completed", requested_quantity: 7 });
    const before = JSON.stringify(snapshot);
    await run(["--apply", "--mapping", "mock.json"]);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const statements = tx.$executeRaw.mock.calls.map(call => call[0].join("?")).join("\n");
    expect(statements).not.toMatch(/UPDATE\s+(transaction_items|transactions|asset_status_histories)|asset_quantity\s*=/i);
    expect(tx.assetStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.assetStatusHistory.create.mock.calls[0][0].data).toMatchObject({ assetId: snapshot.assets[0].id, previousQuantity: 3, newQuantity: 3, quantityBefore: 3, quantityAfter: 3, quantityChanged: 0, stockCode: "CODE" });
  });
  it("blocks outstanding workflows rather than migrating their items", async () => {
    snapshot.transactions.push({ id: "pending", workflow_status: "PENDING" });
    snapshot.items.push({ id: "pending-item", asset_id: snapshot.assets[0].id, asset_model_id: snapshot.models[1].id, transaction_id: "pending" });
    await expect(run(["--apply", "--mapping", "mock.json"])).rejects.toThrow(/unsafe/);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.assetStatusHistory.create).not.toHaveBeenCalled();
  });
  it("propagates audit failure out of the one transaction and does not archive", async () => {
    tx.assetStatusHistory.create.mockRejectedValue(new Error("audit failed"));
    await expect(run(["--apply", "--mapping", "mock.json"])).rejects.toThrow("audit failed");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it("refuses absent actor before any update", async () => {
    tx.user.findUnique.mockResolvedValue(null);
    await expect(run(["--apply", "--mapping", "mock.json"])).rejects.toThrow(/actor/);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("refuses stale approval before any update", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({ version: 1, approved: true, revision: "0".repeat(64), actorId: "44444444-4444-4444-8444-444444444444", reason: "Review", pairs: [{ usedModelId: snapshot.models[1].id, newModelId: snapshot.models[0].id }] }));
    await expect(run(["--apply", "--mapping", "mock.json"])).rejects.toThrow(/revision changed/);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
