type SummaryApproval = {
  requiredTag: string;
  stepSequence: number;
  resolutionBatchId?: string | null;
  isCurrent?: boolean;
  user?: { id?: string; name: string; email: string | null } | null;
};

export function transactionSummaryApprovers(approvals: SummaryApproval[]) {
  const seen = new Set<string>();
  return approvals.filter((approval) => approval.isCurrent !== false && !approval.resolutionBatchId
    && approval.stepSequence > 1 && approval.requiredTag !== "REQUESTER" && !approval.requiredTag.startsWith("ACK_"))
    .sort((left, right) => left.stepSequence - right.stepSequence)
    .flatMap((approval) => {
      const person = approval.user;
      if (!person) return [];
      const key = person.id ?? person.email ?? person.name;
      if (seen.has(key)) return [];
      seen.add(key);
      return [person.name || person.email || "-"];
    }).join(", ") || "-";
}
