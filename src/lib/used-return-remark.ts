type UsedReturnOrigin = { id: string; quantity: number; requestNo: string | null };

export function appendUsedReturnRemarks(note: string | null, origins: UsedReturnOrigin[]) {
  let result = note ?? "";
  for (const origin of origins) {
    const marker = `[return-outcome:${origin.id}]`;
    if (!origin.requestNo || result.includes(marker)) continue;
    result = [result, `${marker} USED ${origin.quantity} from ${origin.requestNo}`].filter(Boolean).join("\n");
  }
  return result || null;
}
