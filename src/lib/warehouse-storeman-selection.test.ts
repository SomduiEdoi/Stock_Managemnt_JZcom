import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";
const mocks = vi.hoisted(() => ({ users: vi.fn(), transaction: vi.fn(), candidate: vi.fn(), warehouse: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findMany: mocks.users }, $transaction: mocks.transaction } }));
vi.mock("@/lib/permissions", () => ({ hasRole: () => true }));
import { createWarehouseForUser, getStockControllersForWarehouseForm, updateWarehouseForUser } from "./warehouses";
const actor = { id: "admin", roles: ["ADMIN"] } as CurrentUser;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.warehouse.mockResolvedValue({ id: "warehouse" }); mocks.candidate.mockResolvedValue(null);
  mocks.transaction.mockImplementation((callback) => callback({ user: { findFirst: mocks.candidate }, assetWarehouse: { findFirst: mocks.warehouse, create: mocks.create } }));
});
describe("Storeman selection is restricted to the explicit system role", () => {
  it("marks Storeman roles separately from Warehouse Managers", async () => {
    mocks.users.mockResolvedValue([
      { id: "store", name: "Store", email: null, position: null, roles: [{ role: { code: "STOREMAN" } }] },
      { id: "manager", name: "Manager", email: null, position: null, roles: [{ role: { code: "USER" } }] },
    ]);
    const options = await getStockControllersForWarehouseForm();
    expect(options.map(({ id, isStoreman }) => ({ id, isStoreman }))).toEqual([{ id: "store", isStoreman: true }, { id: "manager", isStoreman: false }]);
    expect(mocks.users).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }));
  });
  it.each(["create", "update"])("rejects a non-Storeman in %s inside the transaction", async (operation) => {
    const input = { controllerId: "not-storeman", warehouseName: "QA Warehouse", prefix: "QA" };
    await expect(operation === "create" ? createWarehouseForUser(actor, input) : updateWarehouseForUser(actor, "QA", input)).rejects.toMatchObject({ statusCode: 422, code: "INVALID_STOREMAN" });
    expect(mocks.candidate).toHaveBeenCalledWith({ select: { id: true }, where: { id: "not-storeman", isActive: true, roles: { some: { role: { code: "STOREMAN" } } } } });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
