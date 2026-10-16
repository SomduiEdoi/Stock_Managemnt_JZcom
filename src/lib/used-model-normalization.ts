import { createHash } from "node:crypto";
import { z } from "zod";

export type Row = { id: string; [key: string]: unknown };
export type NormalizationSnapshot = {
  models: Row[];
  assets: Row[];
  items: Row[];
  transactions: Row[];
  reservations: Row[];
  histories: Row[];
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const used = (value: unknown) => /\s*\(used\)\s*$/i.test(text(value));
const base = (value: unknown) => text(value).replace(/\s*\(used\)\s*$/i, "").trim();
export const isLegacyUsed = (model: Row) => used(model.name) || used(model.description);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function snapshotRevision(snapshot: NormalizationSnapshot) {
  const sorted = Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, [...rows].sort((a, b) => a.id.localeCompare(b.id))]));
  return createHash("sha256").update(JSON.stringify(canonical(sorted))).digest("hex");
}

const identityFields = ["warehouse_id", "category_id", "asset_type_id", "brand", "model_no", "part_no", "type_name"];

function sameIdentity(a: Row, b: Row) {
  return identityFields.every(key => a[key] === b[key]) &&
    base(a.name) === text(b.name) && base(a.description) === text(b.description) &&
    Boolean(text(a.brand)) && Boolean(text(a.part_no) || text(a.model_no));
}

export function buildNormalizationReport(snapshot: NormalizationSnapshot) {
  const pairs = snapshot.models.filter(isLegacyUsed).map(source => {
    const candidates = snapshot.models.filter(target => !isLegacyUsed(target) && target.id !== source.id && sameIdentity(source, target));
    const assets = snapshot.assets.filter(asset => asset.asset_model_id === source.id);
    const reasons: string[] = [];
    if (assets.length === 0) reasons.push("No stock rows available for per-asset audit; review model archival separately");
    if (!text(source.brand) || !text(source.part_no) && !text(source.model_no)) reasons.push("Missing brand or strong product identifier (part/model number)");
    if (source.is_serialized !== false) reasons.push("Legacy model is serialized or tracking is unknown");
    if (candidates.length !== 1) reasons.push(`Expected exactly one strict identity match; found ${candidates.length}`);
    const target = candidates.length === 1 ? candidates[0] : undefined;
    if (target && (target.is_serialized !== false || target.is_active !== true)) reasons.push("Target must be active and non-serialized");
    if (target && snapshot.models.filter(other => isLegacyUsed(other) && sameIdentity(other, target)).length !== 1) reasons.push("Multiple legacy Used models share this target identity");
    const assetIds = new Set(assets.map(asset => asset.id));
    if (assets.some(asset => asset.warehouse_id !== source.warehouse_id || text(asset.serial_no))) reasons.push("Stock warehouse mismatch or unexpected serial number");
    if (assets.some(asset => !text(asset.stock_code) || !Number.isInteger(asset.asset_quantity) || Number(asset.asset_quantity) < 0 || !["NEW", "USED"].includes(text(asset.condition)))) reasons.push("Invalid stock code, quantity, or condition");
    if (assets.some(asset => asset.request_locked_by != null || asset.request_locked_at != null || asset.status === "REQUEST")) reasons.push("Stock is request-locked");
    if (snapshot.reservations.some(row => assetIds.has(text(row.asset_id)))) reasons.push("Stock has reservations");
    const completed = new Set(snapshot.transactions.filter(row => ["COMPLETED", "CANCELLED"].includes(text(row.workflow_status))).map(row => row.id));
    if (snapshot.items.some(row => (row.asset_model_id === source.id || assetIds.has(text(row.asset_id))) && !completed.has(text(row.transaction_id)))) reasons.push("Model or stock has unresolved transaction references");
    const relatedCandidates = snapshot.models.filter(row => !isLegacyUsed(row) && row.warehouse_id === source.warehouse_id && (base(source.name) === text(row.name) || (base(source.description) && base(source.description) === text(row.description))));
    const relatedCandidateDetails = relatedCandidates.map(row => ({
      id: row.id,
      differences: [...identityFields, "name", "description"].flatMap(field => {
        const sourceValue = ["name", "description"].includes(field) ? base(source[field]) : source[field];
        const candidateValue = ["name", "description"].includes(field) ? text(row[field]) : row[field];
        return sourceValue === candidateValue ? [] : [{ field, sourceValue, candidateValue }];
      }),
    }));
    return { usedModelId: source.id, newModelId: target?.id ?? null, safe: reasons.length === 0, reasons, candidateIds: candidates.map(row => row.id), relatedCandidateIds: relatedCandidates.map(row => row.id), relatedCandidateDetails, assets: assets.map(row => ({ id: row.id, stockCode: row.stock_code, quantity: row.asset_quantity, condition: row.condition, warehouseId: row.warehouse_id })), source };
  });
  return { revision: snapshotRevision(snapshot), pairs };
}

export const approvedMappingSchema = z.object({
  version: z.literal(1),
  approved: z.literal(true),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  actorId: z.string().uuid(),
  reason: z.string().trim().min(1),
  pairs: z.array(z.object({ usedModelId: z.string().uuid(), newModelId: z.string().uuid() }).strict()).min(1),
}).strict();

export function validateApprovedMapping(input: unknown, snapshot: NormalizationSnapshot) {
  const mapping = approvedMappingSchema.parse(input);
  const report = buildNormalizationReport(snapshot);
  if (mapping.revision !== report.revision) throw new Error("Database revision changed; regenerate and reapprove mapping");
  const sources = new Set<string>();
  const targets = new Set<string>();
  for (const pair of mapping.pairs) {
    if (sources.has(pair.usedModelId) || targets.has(pair.newModelId)) throw new Error("Duplicate source or target mapping");
    sources.add(pair.usedModelId);
    targets.add(pair.newModelId);
    if (!report.pairs.some(row => row.safe && row.usedModelId === pair.usedModelId && row.newModelId === pair.newModelId)) throw new Error("Mapping is ambiguous, unsafe, or not an exact reported pair");
  }
  return mapping;
}
