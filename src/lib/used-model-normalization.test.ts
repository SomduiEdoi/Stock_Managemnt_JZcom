import { describe, expect, it } from "vitest";
import { buildNormalizationReport, snapshotRevision, validateApprovedMapping, type NormalizationSnapshot } from "./used-model-normalization";

export function fixture(): NormalizationSnapshot {
  const model = { id: "11111111-1111-4111-8111-111111111111", name: "Cable", description: "Cable 3M", brand: "Brand", part_no: "P-3", model_no: null, type_name: "Cable", warehouse_id: "warehouse", category_id: "category", asset_type_id: "type", is_serialized: false, is_active: true };
  return { models: [model, { ...model, id: "22222222-2222-4222-8222-222222222222", description: "Cable 3M(Used)" }], assets: [{ id: "33333333-3333-4333-8333-333333333333", asset_model_id: "22222222-2222-4222-8222-222222222222", warehouse_id: "warehouse", stock_code: "STOCK-USED", asset_quantity: 0, condition: "NEW", status: "READY", serial_no: null }], items: [], transactions: [], reservations: [], histories: [] };
}

export function approval(snapshot: NormalizationSnapshot) {
  return { version: 1, approved: true, revision: snapshotRevision(snapshot), actorId: "44444444-4444-4444-8444-444444444444", reason: "Reviewed exact legacy pair", pairs: [{ usedModelId: snapshot.models[1].id, newModelId: snapshot.models[0].id }] };
}

describe("legacy Used normalization", () => {
  it("reports a strict pair without mutating IDs, codes, quantities, or inputs", () => {
    const snapshot = fixture();
    const before = JSON.stringify(snapshot);
    const report = buildNormalizationReport(snapshot);
    expect(report.pairs[0].safe).toBe(true);
    expect(report.pairs[0].assets[0]).toMatchObject({ id: snapshot.assets[0].id, stockCode: "STOCK-USED", quantity: 0 });
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(validateApprovedMapping(approval(snapshot), snapshot).pairs).toHaveLength(1);
  });
  it.each(["warehouse_id", "category_id", "asset_type_id", "brand", "part_no", "model_no", "name", "description", "type_name"])("rejects mismatching %s", key => {
    const snapshot = fixture();
    snapshot.models[0][key] = "different";
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
  });
  it("never pairs on a name alone", () => {
    const snapshot = fixture();
    snapshot.models.forEach(model => { model.part_no = null; });
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
  });
  it("reports exact conflicting candidate evidence without accepting the hint", () => {
    const snapshot = fixture();
    snapshot.models[0].part_no = "OTHER-PART";
    const pair = buildNormalizationReport(snapshot).pairs[0];
    expect(pair.safe).toBe(false);
    expect(pair.relatedCandidateDetails[0].differences).toEqual([{ field: "part_no", sourceValue: "P-3", candidateValue: "OTHER-PART" }]);
  });
  it("does not silently archive models without an asset audit", () => {
    const snapshot = fixture();
    snapshot.assets = [];
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
  });
  it("rejects duplicate targets and duplicate legacy aliases", () => {
    const snapshot = fixture();
    snapshot.models.push({ ...snapshot.models[0], id: "duplicate" });
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
    snapshot.models.pop();
    snapshot.models.push({ ...snapshot.models[1], id: "duplicate-used" });
    expect(buildNormalizationReport(snapshot).pairs.every(pair => !pair.safe)).toBe(true);
  });
  it.each(["is_serialized", "is_active"])("rejects unsuitable target %s", key => {
    const snapshot = fixture();
    snapshot.models[0][key] = key === "is_serialized";
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
  });
  it("rejects serialized source and unexpected serial stock", () => {
    const snapshot = fixture();
    snapshot.models[1].is_serialized = true;
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
    snapshot.models[1].is_serialized = false;
    snapshot.assets[0].serial_no = "SERIAL";
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
  });
  it.each([{ stock_code: null }, { asset_quantity: -1 }, { asset_quantity: 0.5 }, { condition: "UNKNOWN" }, { warehouse_id: "other" }, { request_locked_by: "user" }, { status: "REQUEST" }])("blocks invalid or locked assets %j", change => {
    const snapshot = fixture();
    Object.assign(snapshot.assets[0], change);
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
  });
  it("blocks reservations and unresolved model-only transaction references", () => {
    const snapshot = fixture();
    snapshot.reservations.push({ id: "reservation", asset_id: snapshot.assets[0].id });
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
    snapshot.reservations = [];
    snapshot.items.push({ id: "item", asset_model_id: snapshot.models[1].id, transaction_id: "transaction" });
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(false);
    snapshot.transactions.push({ id: "transaction", workflow_status: "COMPLETED" });
    expect(buildNormalizationReport(snapshot).pairs[0].safe).toBe(true);
  });
  it("requires explicit approval and disallows empty, duplicate, unknown, and reversed mappings", () => {
    const snapshot = fixture();
    const mapping = approval(snapshot);
    expect(() => validateApprovedMapping({ ...mapping, approved: false }, snapshot)).toThrow();
    expect(() => validateApprovedMapping({ ...mapping, pairs: [] }, snapshot)).toThrow();
    expect(() => validateApprovedMapping({ ...mapping, pairs: [...mapping.pairs, ...mapping.pairs] }, snapshot)).toThrow(/Duplicate/);
    expect(() => validateApprovedMapping({ ...mapping, pairs: [{ usedModelId: mapping.pairs[0].newModelId, newModelId: mapping.pairs[0].usedModelId }] }, snapshot)).toThrow(/unsafe/);
  });
  it("detects quantity, history, metadata, and membership revision changes", () => {
    for (const mutate of [(s: NormalizationSnapshot) => { s.assets[0].asset_quantity = 1; }, (s: NormalizationSnapshot) => { s.histories.push({ id: "history" }); }, (s: NormalizationSnapshot) => { s.models[0].updated_at = "new"; }, (s: NormalizationSnapshot) => { s.assets.push({ id: "added" }); }]) {
      const snapshot = fixture();
      const mapping = approval(snapshot);
      mutate(snapshot);
      expect(() => validateApprovedMapping(mapping, snapshot)).toThrow(/revision changed/);
    }
  });
  it("hashes deterministically independent of row and property order", () => {
    const snapshot = fixture();
    const reordered = { ...snapshot, models: snapshot.models.slice().reverse().map(model => Object.fromEntries(Object.entries(model).reverse()) as typeof model) };
    expect(snapshotRevision(reordered)).toBe(snapshotRevision(snapshot));
  });
});
