import { AssetStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  calculateQuantityAvailability,
  getAvailabilityByAssetId,
} from "@/lib/asset-availability";
import { getAvailableQuantities } from "@/lib/workflow/stock-movement";

describe("quantity stock availability", () => {
  it.each([
    [10, 0, 0, 10],
    [10, 2, 3, 5],
    [10, 5, 5, 0],
    [3, 4, 2, 0],
    [0, 0, 0, 0],
  ])(
    "shares quantity calculation for on-hand %i, draft %i and pending %i",
    (onHand, draft, pending, expected) => {
      expect(calculateQuantityAvailability(onHand, draft, pending)).toEqual({
        availableQuantity: expected,
        reservedQuantity: draft + pending,
      });
    },
  );

  it("uses the same reservation query and availability in inventory and workflow", async () => {
    const client = {
      assetReservation: {
        groupBy: vi
          .fn()
          .mockResolvedValue([{ assetId: "stock", _sum: { quantity: 2 } }]),
      },
      transactionItem: {
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { assetId: "stock", _sum: { requestedQuantity: 3 } },
          ]),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const asset = {
      id: "stock",
      assetQuantity: 10,
      status: AssetStatus.READY,
      serialNo: null,
      assetModel: { isSerialized: false },
    };
    const inventory = await getAvailabilityByAssetId([asset], {
      client: client as never,
    });
    const inventoryQuery = client.transactionItem.groupBy.mock.calls[0][0];
    const workflow = await getAvailableQuantities(client as never, [
      asset as never,
    ]);
    expect(workflow.get(asset.id)).toBe(
      inventory.get(asset.id)?.availableQuantity,
    );
    expect(workflow.get(asset.id)).toBe(5);
    expect(client.transactionItem.groupBy.mock.calls[1][0]).toEqual(
      inventoryQuery,
    );
  });
  it("reserves only unissued source requests, never issued stock or derived sales twice", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValue([
        { assetId: "stock", _sum: { requestedQuantity: 5 } },
      ]);
    const client = {
      assetReservation: { groupBy: vi.fn().mockResolvedValue([]) },
      transactionItem: { groupBy, findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await getAvailabilityByAssetId(
      [
        {
          id: "stock",
          assetQuantity: 70,
          status: AssetStatus.READY,
          serialNo: null,
          assetModel: { isSerialized: true },
        },
      ],
      { client: client as never },
    );
    expect(result.get("stock")).toMatchObject({
      availableQuantity: 65,
      reservedQuantity: 5,
      totalQuantity: 70,
      trackMethod: "QUANTITY",
    });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dispatchedAt: null,
          transaction: expect.objectContaining({ sourceTransactionId: null }),
        }),
      }),
    );
  });

  it("ignores null asset groups without creating invalid availability entries", async () => {
    const client = {
      assetReservation: { groupBy: vi.fn().mockResolvedValue([]) },
      transactionItem: {
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { assetId: null, _sum: { requestedQuantity: 100 } },
          ]),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const result = await getAvailabilityByAssetId(
      [
        {
          id: "stock",
          assetQuantity: 3,
          status: AssetStatus.READY,
          assetModel: { isSerialized: false },
        },
      ],
      { client: client as never },
    );
    expect(result.get("stock")?.availableQuantity).toBe(3);
  });
});
