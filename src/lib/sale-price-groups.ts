export type SalePriceGroup = { quantity: number; unitPrice: string; total: string };

const centsPerUnit = BigInt(100);
const maximumMoneyCents = BigInt("999999999999");

function moneyCents(value: string) {
  const text = value.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error("Enter nonnegative prices with at most two decimal places.");
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole || "0") * centsPerUnit + BigInt(fraction.padEnd(2, "0"));
  if (cents > maximumMoneyCents) throw new Error("Amounts cannot exceed 9,999,999,999.99.");
  return cents;
}

function formatCents(cents: bigint) {
  if (cents > maximumMoneyCents) throw new Error("Amounts cannot exceed 9,999,999,999.99.");
  return `${cents / centsPerUnit}.${(cents % centsPerUnit).toString().padStart(2, "0")}`;
}

export function normalizeSaleMoney(value: string) {
  return formatCents(moneyCents(value));
}

export function calculateSaleGroupTotal(quantity: number, unitPrice: string) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Quantity must be a positive integer.");
  if (!unitPrice.trim()) return "";
  return formatCents(moneyCents(unitPrice) * BigInt(quantity));
}

export function calculateSaleGrandTotal(groups: Pick<SalePriceGroup, "quantity" | "unitPrice">[]) {
  const cents = groups.reduce((sum, group) => {
    const total = calculateSaleGroupTotal(group.quantity, group.unitPrice);
    return sum + (total ? moneyCents(total) : BigInt(0));
  }, BigInt(0));
  return formatCents(cents);
}

export function clampSaleGroupQuantity(groups: SalePriceGroup[], index: number, requested: number, value: number, serialized: boolean) {
  if (serialized || requested === 1) return 1;
  const otherQuantity = groups.reduce((sum, group, position) => sum + (position === index ? 0 : group.quantity), 0);
  const maximum = Math.max(1, requested - otherQuantity);
  return Math.min(maximum, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1));
}

export function validateSalePriceGroups(groups: SalePriceGroup[], quantity: number, serialized: boolean, draft: boolean) {
  if (!groups.length || groups.length > quantity || (serialized && groups.length !== 1)) throw new Error("Invalid number of price groups.");
  let allocated = 0;
  const calculated = groups.map((group) => {
    if (!Number.isSafeInteger(group.quantity) || group.quantity < 1) throw new Error("Each price group must have a positive integer quantity.");
    allocated += group.quantity;
    if (draft && !group.unitPrice.trim()) return { ...group, unitPrice: "", total: "" };
    const unitPrice = normalizeSaleMoney(group.unitPrice);
    return { ...group, unitPrice, total: calculateSaleGroupTotal(group.quantity, unitPrice) };
  });
  if (allocated > quantity || (!draft && allocated !== quantity)) throw new Error("Price group quantities must match the requested quantity before approval.");
  calculateSaleGrandTotal(calculated);
  return calculated;
}
