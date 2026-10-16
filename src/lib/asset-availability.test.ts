import { AssetStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getAvailabilityByAssetId } from "@/lib/asset-availability";

describe("quantity stock availability", () => {
  it("reserves only unissued source requests, never issued stock or derived sales twice", async () => {
    const groupBy = vi.fn().mockResolvedValue([{ assetId: "stock", _sum: { requestedQuantity: 5 } }]);
    const client = {
      assetReservation: { groupBy: vi.fn().mockResolvedValue([]) },
      transactionItem: { groupBy, findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await getAvailabilityByAssetId([{
      id: "stock", assetQuantity: 70, status: AssetStatus.READY,
      serialNo: null, assetModel: { isSerialized: true },
    }], { client: client as never });
    expect(result.get("stock")).toMatchObject({ availableQuantity: 65, reservedQuantity: 5, totalQuantity: 70, trackMethod: "QUANTITY" });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dispatchedAt: null, transaction: expect.objectContaining({ sourceTransactionId: null }) }) }));
  });

  it("ignores null asset groups without creating invalid availability entries", async () => {
    const client = {
      assetReservation: { groupBy: vi.fn().mockResolvedValue([]) },
      transactionItem: { groupBy: vi.fn().mockResolvedValue([{ assetId: null, _sum: { requestedQuantity: 100 } }]), findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await getAvailabilityByAssetId([{ id: "stock", assetQuantity: 3, status: AssetStatus.READY, assetModel: { isSerialized: false } }], { client: client as never });
    expect(result.get("stock")?.availableQuantity).toBe(3);
  });
});
