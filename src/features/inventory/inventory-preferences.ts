import { z } from "zod";

export const inventoryPreferencesSchema = z
  .object({
    columns: z.array(z.string()).optional(),
    widths: z.record(z.number().finite().nonnegative()).optional(),
  })
  .nullable();

export function readInventoryPreferences(json: string | null) {
  return inventoryPreferencesSchema.parse(JSON.parse(json ?? "null"));
}
