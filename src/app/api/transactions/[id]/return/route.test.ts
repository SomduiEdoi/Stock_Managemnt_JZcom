import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ session: vi.fn(), resolve: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserFromSessionToken: mocks.session }));
vi.mock("@/lib/permissions", () => ({ PermissionError: class extends Error {} }));
vi.mock("@/lib/workflow", () => ({
  WorkflowError: class extends Error {
    constructor(message: string, public statusCode: number, public code: string) { super(message); }
  },
  resolveTransactionItems: mocks.resolve,
  deletePendingReturnOutcome: mocks.remove,
}));

import { POST } from "./route";
import { WorkflowError } from "@/lib/workflow";

const id = "56f80d86-923e-4d5b-a976-2522fc49eec6";
const itemId = "00000000-0000-4000-8000-000000000001";
const actor = { id: "requester" };
const body = (quantity = 1) => ({ items: [{ itemId, quantity, toStatus: "READY" }] });
const call = (payload: unknown) => POST(new NextRequest(`http://localhost/api/transactions/${id}/return`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
}), { params: Promise.resolve({ id }) });

describe("return POST API contract", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue(actor); });

  it("rejects unauthenticated requests before mutation", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call(body())).status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])("rejects invalid quantity %s before mutation", async (quantity) => {
    expect((await call(body(quantity))).status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("rejects empty items before mutation", async () => {
    expect((await call({ items: [] })).status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("forwards authenticated identity and split allocations without dropping quantities", async () => {
    mocks.resolve.mockResolvedValue({ id });
    const payload = { items: [{ itemId, toStatus: "READY", allocations: [
      { quantity: 1, toStatus: "READY", returnCondition: "NEW" },
      { quantity: 1, toStatus: "LOST" },
    ] }] };
    expect((await call(payload)).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(actor, { transactionId: id, items: payload.items, resolutionBatchId: undefined });
  });

  it.each([[403, "FORBIDDEN"], [400, "RETURN_QUANTITY_EXCEEDED"], [409, "ALREADY_RESOLVED"]] as const)(
    "preserves workflow rejection %s / %s", async (status, code) => {
      mocks.resolve.mockRejectedValue(new WorkflowError("Rejected by workflow", status, code));
      const response = await call(body(2));
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ code });
    },
  );

  it("returns a retryable conflict for concurrent database updates", async () => {
    mocks.resolve.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6.19.3" }));
    const response = await call(body());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CONCURRENT_UPDATE" });
  });
});
