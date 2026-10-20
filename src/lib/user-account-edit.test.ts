import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";
const mocks = vi.hoisted(() => ({ find: vi.fn(), conflict: vi.fn(), update: vi.fn(), directory: vi.fn(), role: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), warehouses: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find, findFirst: mocks.conflict }, role: { findUnique: mocks.role }, userRole: { deleteMany: mocks.deleteMany, create: mocks.create }, assetWarehouse: { findMany: mocks.warehouses }, userWarehousePermission: { deleteMany: mocks.deleteMany, createMany: mocks.create }, $transaction: mocks.transaction } }));
vi.mock("@/lib/permissions", () => ({ hasRole: () => true }));
vi.mock("@/lib/ldap", () => ({ findLdapUserByEmail: mocks.directory, LdapDirectoryError: class extends Error {} }));
import { updateUserForAdmin } from "./user-management";
const actor = { id: "admin" } as CurrentUser;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({ id: "local", provider: "LOCAL", localUsername: "person", name: "person", projectTag: null, roles: [{ role: { code: "STOREMAN" } }] });
  mocks.conflict.mockResolvedValue(null);
  mocks.role.mockResolvedValue({ id: "role" }); mocks.warehouses.mockResolvedValue([]);
  mocks.transaction.mockImplementation((callback) => callback({ user: { update: mocks.update }, userOrganizationAssignment: { deleteMany: mocks.deleteMany } }));
});
describe("Local account editing", () => {
  it("normalizes a new login username and updates its generated display name", async () => {
    await updateUserForAdmin(actor, "local", { email: "", name: "", username: " New.Username ", role: "STOREMAN" });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ where: { id: "local" }, data: { localUsername: "new.username", name: "new.username" } });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("passwordHash");
    expect(mocks.directory).not.toHaveBeenCalled();
  });
  it("rejects duplicate usernames before writing", async () => {
    mocks.conflict.mockResolvedValue({ id: "other" });
    await expect(updateUserForAdmin(actor, "local", { email: "", name: "", username: "taken", role: "STOREMAN" })).rejects.toMatchObject({ statusCode: 409, code: "USERNAME_EXISTS" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects invalid usernames", async () => {
    await expect(updateUserForAdmin(actor, "local", { email: "", name: "", username: "bad username", role: "STOREMAN" })).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("saves role without requiring email/name or directory verification", async () => {
    await updateUserForAdmin(actor, "local", { email: "", name: "", role: "STOREMAN" });
    expect(mocks.directory).not.toHaveBeenCalled(); expect(mocks.conflict).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "local" }, data: { email: undefined, localUsername: undefined, name: undefined, projectTag: null } }));
  });
  it("ignores hidden identity edits for Local accounts", async () => {
    await updateUserForAdmin(actor, "local", { email: "other@example.com", name: "Other", role: "STOREMAN" });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ email: undefined, name: undefined });
  });
  it("continues requiring AD email", async () => {
    mocks.find.mockResolvedValue({ id: "ad", provider: "AD" });
    await expect(updateUserForAdmin(actor, "ad", { email: "", name: "", role: "ADMIN" })).rejects.toThrow("Email is required");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
