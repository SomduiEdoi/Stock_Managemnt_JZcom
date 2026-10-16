export type ReturnStockModelIdentity = {
  id: string;
  name: string;
  brand: string | null;
  partNo: string | null;
  description: string | null;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function withoutUsedSuffix(value: string | null | undefined) {
  return normalize(value).replace(/\s*\(used\)\s*$/i, "").trim();
}

export function isLegacyUsedModelAlias(
  source: ReturnStockModelIdentity,
  candidate: ReturnStockModelIdentity,
) {
  if (candidate.id === source.id || !/\(used\)\s*$/i.test(candidate.description ?? "")) {
    return false;
  }

  if (normalize(source.brand) !== normalize(candidate.brand)) return false;

  if (source.partNo?.trim()) {
    return normalize(source.partNo) === normalize(candidate.partNo);
  }

  return normalize(source.name) === normalize(candidate.name) &&
    withoutUsedSuffix(source.description) === withoutUsedSuffix(candidate.description);
}
