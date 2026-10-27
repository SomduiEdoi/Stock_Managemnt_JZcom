export function AssetConditionBadge({ condition }: { condition: "NEW" | "USED" }) {
  return <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-bold ${condition === "USED" ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{condition}</span>;
}
