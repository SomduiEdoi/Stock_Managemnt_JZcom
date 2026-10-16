const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function readableNote(value: string | null | undefined) {
  if (!value) return "-";
  return value.split(/\r?\n/).map((line) => line
    .replace(new RegExp(`\\[return-outcome:${uuid}\\]\\s*`, "gi"), "")
    .replace(new RegExp(`;?\\s*(?:return batch|outcome)\\s+${uuid}`, "gi"), "")
    .replace(new RegExp(`\\b${uuid}\\b`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[;\s]+|[;\s]+$/g, "")
  ).filter(Boolean).join("\n") || "-";
}
