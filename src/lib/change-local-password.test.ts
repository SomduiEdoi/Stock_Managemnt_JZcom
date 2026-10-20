import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), audit: vi.fn(), reset: vi.fn(), transaction: vi.fn(), compare: vi.fn(), hash: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find }, $transaction: mocks.transaction } }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock("@/lib/login-security", () => ({ checkLoginLimit: mocks.limit }));
import { changeLocalPassword, changePasswordSchema } from "./change-local-password";
const input = { currentPassword: "old-password-12345", newPassword: "New-password-12345!", confirmPassword: "New-password-12345!" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.find.mockResolvedValue({ provider: "LOCAL", isActive: true, localUsername: "person", passwordHash: "old-hash" });
  mocks.limit.mockResolvedValue({ allowed: true, accountKey: "password-change-key" }); mocks.compare.mockResolvedValue(true); mocks.hash.mockResolvedValue("new-hash"); mocks.update.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation((callback) => callback({ user: { updateMany: mocks.update }, loginAudit: { create: mocks.audit }, loginThrottle: { deleteMany: mocks.reset } }));
});
describe("self-service Local password changes", () => {
  it("changes the session user's hash and records an audit without passwords", async () => {
    await changeLocalPassword("session-user", input);
    expect(mocks.compare).toHaveBeenCalledWith(input.currentPassword, "old-hash");
    expect(mocks.hash).toHaveBeenCalledWith(input.newPassword, 12);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "session-user", provider: "LOCAL", isActive: true, passwordHash: "old-hash" }, data: { passwordHash: "new-hash" } });
    expect(mocks.audit).toHaveBeenCalledWith({ data: { userId: "session-user", mode: "LOCAL", result: "PASSWORD_CHANGED" } });
  });
  it.each([{ provider: "AD", isActive: true }, { provider: "LOCAL", isActive: false }, null])("rejects unavailable/non-local accounts %j", async (account) => { mocks.find.mockResolvedValue(account); await expect(changeLocalPassword("user", input)).rejects.toMatchObject({ statusCode: 403 }); expect(mocks.update).not.toHaveBeenCalled(); });
  it("rejects an incorrect current password", async () => { mocks.compare.mockResolvedValue(false); await expect(changeLocalPassword("user", input)).rejects.toThrow("incorrect"); expect(mocks.hash).not.toHaveBeenCalled(); });
  it("rate limits repeated attempts", async () => { mocks.limit.mockResolvedValue({ allowed: false }); await expect(changeLocalPassword("user", input)).rejects.toMatchObject({ statusCode: 429 }); expect(mocks.compare).not.toHaveBeenCalled(); });
  it("rejects concurrent password replacement", async () => { mocks.update.mockResolvedValue({ count: 0 }); await expect(changeLocalPassword("user", input)).rejects.toMatchObject({ statusCode: 409 }); expect(mocks.audit).not.toHaveBeenCalled(); });
  it.each([{ newPassword: "short", confirmPassword: "short" }, { confirmPassword: "mismatch" }, { newPassword: input.currentPassword, confirmPassword: input.currentPassword }, { userId: "someone-else" }, { newPassword: "ก".repeat(25), confirmPassword: "ก".repeat(25) }])("rejects invalid input %j", (change) => expect(changePasswordSchema.safeParse({ ...input, ...change }).success).toBe(false));
});
