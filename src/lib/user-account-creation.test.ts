import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), local: vi.fn(), ad: vi.fn(), hasRole: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/permissions", () => ({ hasRole: mocks.hasRole }));
vi.mock("@/lib/user-account-providers", () => ({ createLocalUser: mocks.local, createActiveDirectoryUser: mocks.ad }));
import { createUserForAdmin } from "./user-management";
const actor = { id: "admin" } as CurrentUser;
const data = { provider: "LOCAL" as const, email: "person@example.com", name: "Person", role: "STOREMAN" as const, username: "person", password: "A-long-password-123!", confirmPassword: "A-long-password-123!" };
const tx = {
  role: { findUnique: vi.fn() },
  userOrganizationAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
  user: { update: vi.fn() },
  userRole: { create: vi.fn() },
  assetWarehouse: { findMany: vi.fn() },
  userWarehousePermission: { createMany: vi.fn() },
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.hasRole.mockReturnValue(true);
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.local.mockResolvedValue({ id: "new" }); mocks.ad.mockResolvedValue({ id: "new" });
  tx.role.findUnique.mockResolvedValue({ id: "role" }); tx.assetWarehouse.findMany.mockResolvedValue([{ id: "warehouse" }]);
  tx.userRole.create.mockResolvedValue({});
});
describe("admin account creation orchestration", () => {
  it("preserves separate teams with the same generic level tag and one primary", async () => {
    await createUserForAdmin(actor, { ...data, role: "USER", organizationAssignments: [
      { team: "SYSTEM", organizationLevel: "MANAGER", organizationTag: "MANAGER" },
      { team: "NETWORK", organizationLevel: "MANAGER", organizationTag: "MANAGER" },
    ], primaryOrganizationKey: "NETWORK:MANAGER:MANAGER" });
    expect(tx.userOrganizationAssignment.createMany).toHaveBeenCalledWith({ data: [
      { team: "SYSTEM", organizationLevel: "MANAGER", organizationTag: "MANAGER", isPrimary: false, userId: "new" },
      { team: "NETWORK", organizationLevel: "MANAGER", organizationTag: "MANAGER", isPrimary: true, userId: "new" },
    ] });
  });
  it("creates credentials, role and permissions within the same transaction", async () => {
    await expect(createUserForAdmin(actor, data)).resolves.toEqual({ id: "new" });
    expect(mocks.local).toHaveBeenCalledWith(tx, data);
    expect(mocks.ad).not.toHaveBeenCalled();
    expect(tx.userRole.create).toHaveBeenCalledWith({ data: { userId: "new", roleId: "role" } });
    expect(tx.userWarehousePermission.createMany).toHaveBeenCalledWith({ data: [{ userId: "new", warehouseId: "warehouse", canView: true, canManage: false }] });
  });
  it("does not permit non-admin provisioning", async () => { mocks.hasRole.mockReturnValue(false); await expect(createUserForAdmin(actor, data)).rejects.toThrow("Only admin"); expect(mocks.transaction).not.toHaveBeenCalled(); });
  it("validates credentials before opening a transaction", async () => { await expect(createUserForAdmin(actor, { ...data, confirmPassword: "different" })).rejects.toThrow(); expect(mocks.transaction).not.toHaveBeenCalled(); });
  it("does not swallow role-write failures", async () => { tx.userRole.create.mockRejectedValueOnce(new Error("role write failed")); await expect(createUserForAdmin(actor, data)).rejects.toThrow("role write failed"); });
});
