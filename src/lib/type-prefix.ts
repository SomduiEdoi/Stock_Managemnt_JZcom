export function duplicateTypePrefix(types: ReadonlyArray<{ code?: string | null; delete?: boolean }>) {
  const seen = new Set<string>();
  for (const type of types) {
    if (type.delete) continue;
    const code = type.code?.trim().toUpperCase();
    if (!code) continue;
    if (seen.has(code)) return code;
    seen.add(code);
  }
  return null;
}
