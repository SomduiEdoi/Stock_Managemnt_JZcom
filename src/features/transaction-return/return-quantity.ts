type Item = { itemId: string; requestedQuantity: number; resolvedQuantity?: number };
type Outcome = { itemId: string; quantity: number; approvedAt: string | null; resolutionBatchId: string | null };

export function availableReturnQuantity(item: Item, outcomes: Outcome[], editingBatchId = "") {
  const rows = outcomes.filter((outcome) => outcome.itemId === item.itemId);
  const approved = Math.max(item.resolvedQuantity ?? 0,
    rows.filter((outcome) => outcome.approvedAt).reduce((sum, outcome) => sum + outcome.quantity, 0));
  const pending = rows.filter((outcome) => !outcome.approvedAt &&
    (!editingBatchId || outcome.resolutionBatchId !== editingBatchId))
    .reduce((sum, outcome) => sum + outcome.quantity, 0);
  return Math.max(0, item.requestedQuantity - approved - pending);
}
