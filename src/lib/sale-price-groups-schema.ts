import { z } from "zod";
import {
  normalizeSaleMoney,
  type SalePriceGroup,
} from "@/lib/sale-price-groups";

const storedMoneySchema = z.string().refine((value) => {
  if (!value.trim()) return true; // A saved draft may not have a price yet.
  try {
    normalizeSaleMoney(value);
    return true;
  } catch {
    return false;
  }
}, "Invalid stored money value.");

export const salePriceGroupSchema = z.object({
  quantity: z.number().int().positive().safe(),
  unitPrice: storedMoneySchema,
  total: storedMoneySchema,
});

export const salePriceGroupsSchema = z.array(salePriceGroupSchema);

export function readStoredSalePriceGroups(
  value: unknown,
): SalePriceGroup[] | undefined {
  if (value === null || value === undefined) return undefined;
  const result = salePriceGroupsSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Stored sale price groups are invalid. Review the source data before pricing or exporting.",
    );
  return result.data;
}
