import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), consume: vi.fn(), remove: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { destructiveConfirmation: { deleteMany: mocks.consume }, $transaction: mocks.transaction } }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireApiUser: mocks.actor }));
vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.actor, getUserFromSessionToken: mocks.actor }));
vi.mock("@/lib/asset-edit", () => ({ deleteAssetForUser: mocks.remove, updateAssetForUser: vi.fn() }));
vi.mock("@/lib/user-management", () => ({ deleteUserForAdmin: mocks.remove, updateUserForAdmin: vi.fn() }));
vi.mock("@/lib/project-management", () => ({ deleteProjectForAdmin: mocks.remove, updateProjectForAdmin: vi.fn(), getProjectDetail: vi.fn() }));
vi.mock("@/lib/warehouses", () => ({ deleteWarehouseForUser: mocks.remove, updateWarehouseForUser: vi.fn() }));
import { createDeleteProof } from "./destructive-auth";
import { DELETE as assetDelete } from "@/app/api/assets/[id]/route";
import { DELETE as userDelete } from "@/app/api/users/[id]/route";
import { DELETE as projectDelete } from "@/app/api/projects/[id]/route";
import { DELETE as warehouseDelete } from "@/app/api/warehouses/[code]/route";
import { PUT as categorySave } from "@/app/api/warehouses/[code]/categories/route";
const id = "54f97d3e-ef1d-477d-b70b-1e5ffd440a3d";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AUTH_SECRET", "destructive-route-tests");
  mocks.actor.mockResolvedValue({ id: "actor", roles: ["ADMIN"], permissions: [] });
  mocks.consume.mockResolvedValue({ count: 1 }); mocks.remove.mockResolvedValue({ ok: true });
});
describe("destructive API guards", () => {
  for (const [name, handler] of [["assets", assetDelete], ["users", userDelete], ["projects", projectDelete]] as const) {
    it(`blocks direct ${name} deletion without reauthentication`, async () => {
      const response = await handler(new NextRequest(`http://localhost/api/${name}/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(401); expect(mocks.remove).not.toHaveBeenCalled();
    });
    it(`accepts ${name} proof and retains service authorization`, async () => {
      const response = await handler(new NextRequest(`http://localhost/api/${name}/${id}`, { method: "DELETE", headers: { "x-delete-proof": createDeleteProof("actor", `/${name}/${id}`) } }), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(200); expect(mocks.remove).toHaveBeenCalled();
    });
  }
  it("blocks warehouse deletion without proof", async () => {
    expect((await warehouseDelete(new NextRequest("http://localhost/api/warehouses/NETWORK", { method: "DELETE" }), { params: Promise.resolve({ code: "NETWORK" }) })).status).toBe(401);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each(["category", "type"])("blocks %s deletion hidden in a PUT request", async (kind) => {
    const category = { id, name: "Category", delete: kind === "category", types: kind === "type" ? [{ id, name: "Type", delete: true }] : [] };
    const response = await categorySave(new NextRequest("http://localhost/api/warehouses/NETWORK/categories", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categories: [category] }) }), { params: Promise.resolve({ code: "NETWORK" }) });
    expect(response.status).toBe(401); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("does not require a password for Custom Field deletion alone", async () => {
    mocks.transaction.mockResolvedValue({});
    await categorySave(new NextRequest("http://localhost/api/warehouses/NETWORK/categories", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categories: [{ id, name: "Category", customFields: [{ id, key: "test", label: "Test", delete: true }] }] }) }), { params: Promise.resolve({ code: "NETWORK" }) });
    expect(mocks.transaction).toHaveBeenCalled(); expect(mocks.consume).not.toHaveBeenCalled();
  });
});
