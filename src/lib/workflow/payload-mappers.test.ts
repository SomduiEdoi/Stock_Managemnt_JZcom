import { describe, expect, it } from "vitest";
import { toWorkflowAsset, type WorkflowAsset } from "./shared";

describe("Prisma workflow asset mapper", () => {
  it("keeps null fields, model tracking and warehouse permissions without type assertions", () => {
    const source = {
      id: "asset-id",
      assetQuantity: 5,
      condition: "USED",
      stockCode: null,
      requestLockedById: null,
      serialNo: null,
      status: "READY",
      assetModel: {
        isSerialized: false,
        name: "Test Model",
        brand: "Extra Prisma field",
      },
      warehouse: {
        code: "TEST",
        name: "Extra warehouse field",
        permissions: [
          {
            canManage: true,
            user: { id: "user-id", name: "Test User", email: null },
          },
        ],
      },
    } satisfies WorkflowAsset & {
      assetModel: WorkflowAsset["assetModel"] & { brand: string };
      warehouse: WorkflowAsset["warehouse"] & { name: string };
    };
    const mapped: WorkflowAsset = toWorkflowAsset(source);
    expect(mapped).toEqual({
      ...source,
      assetModel: { isSerialized: false, name: "Test Model" },
      warehouse: { code: "TEST", permissions: source.warehouse.permissions },
    });
    expect(mapped).not.toBe(source);
    expect(mapped.warehouse.permissions[0]).not.toBe(
      source.warehouse.permissions[0],
    );
  });
});
