import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), compare: vi.fn(), ldap: vi.fn(), limit: vi.fn(), audit: vi.fn(), clear: vi.fn(), consume: vi.fn(), issue: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { destructiveConfirmation: { deleteMany: mocks.consume, create: mocks.issue }, user: { findUnique: mocks.user }, loginAudit: { create: mocks.audit }, loginThrottle: { deleteMany: mocks.clear } } }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare }));
vi.mock("@/lib/ldap", () => ({ authenticateWithLdap: mocks.ldap }));
vi.mock("@/lib/login-security", () => ({ checkLoginLimit: mocks.limit }));
vi.mock("@/lib/workflow", () => ({ WorkflowError: class extends Error { constructor(message: string, public statusCode = 400, public code?: string) { super(message); } } }));
import { createDeleteProof, requireDeleteProof, verifyDeletePassword } from "./destructive-auth";
const request = (proof = "") => new Request("http://localhost/api/users/target", { headers: { "x-delete-proof": proof } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AUTH_SECRET", "test-secret-not-production");
  mocks.limit.mockResolvedValue({ allowed: true, accountKey: "key" });
  mocks.user.mockResolvedValue({ isActive: true, provider: "LOCAL", passwordHash: "hash" });
  mocks.compare.mockResolvedValue(true);
  mocks.consume.mockResolvedValue({ count: 1 });
});
describe("destructive action reauthentication", () => {
  it("accepts a scoped proof for the current user", async () => { await expect(requireDeleteProof(request(createDeleteProof("actor", "/users/target")), "actor", "/users/target")).resolves.toBeUndefined(); });
  it("rejects missing proof", async () => { await expect(requireDeleteProof(request(), "actor", "/users/target")).rejects.toThrow(); });
  it("rejects a proof from another account", async () => { await expect(requireDeleteProof(request(createDeleteProof("other", "/users/target")), "actor", "/users/target")).rejects.toThrow(); });
  it("rejects a proof for another record", async () => { await expect(requireDeleteProof(request(createDeleteProof("actor", "/users/other")), "actor", "/users/target")).rejects.toThrow(); });
  it("rejects expired proof", async () => { await expect(requireDeleteProof(request(createDeleteProof("actor", "/users/target", Date.now() - 61000)), "actor", "/users/target")).rejects.toThrow(); });
  it("rejects tampered proof", async () => { await expect(requireDeleteProof(request(createDeleteProof("actor", "/users/target") + "bad"), "actor", "/users/target")).rejects.toThrow(); });
  it("rejects reused verification", async () => { mocks.consume.mockResolvedValue({ count: 0 }); await expect(requireDeleteProof(request(createDeleteProof("actor", "/users/target")), "actor", "/users/target")).rejects.toThrow(); });
  it("verifies Local password using hash only", async () => {
    const proof = await verifyDeletePassword("actor", "password", "/users/target");
    expect(mocks.compare).toHaveBeenCalledWith("password", "hash");
    expect(mocks.ldap).not.toHaveBeenCalled();
    await expect(requireDeleteProof(request(proof), "actor", "/users/target")).resolves.toBeUndefined();
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("password");
  });
  it("denies incorrect Local password", async () => { mocks.compare.mockResolvedValue(false); await expect(verifyDeletePassword("actor", "wrong", "/users/target")).rejects.toMatchObject({ statusCode: 401 }); });
  it("verifies AD identity against the current mapped account", async () => {
    mocks.user.mockResolvedValue({ isActive: true, provider: "AD", ldapUsername: "joy", ldapUpn: "joy@example.test" });
    mocks.ldap.mockResolvedValue({ username: "JOY", upn: "JOY@example.test" });
    await verifyDeletePassword("actor", "password", "/assets/target");
    expect(mocks.ldap).toHaveBeenCalledWith("joy@example.test", "password");
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("denies an AD identity mismatch", async () => {
    mocks.user.mockResolvedValue({ isActive: true, provider: "AD", ldapUsername: "joy", ldapUpn: "joy@example.test" });
    mocks.ldap.mockResolvedValue({ username: "other", upn: "other@example.test" });
    await expect(verifyDeletePassword("actor", "password", "/assets/target")).rejects.toMatchObject({ statusCode: 401 });
  });
  it("fails closed when AD is unavailable", async () => {
    mocks.user.mockResolvedValue({ isActive: true, provider: "AD", ldapUsername: "joy", ldapUpn: "joy@example.test" });
    mocks.ldap.mockRejectedValue(new Error("LDAP unavailable"));
    await expect(verifyDeletePassword("actor", "password", "/assets/target")).rejects.toThrow("LDAP unavailable");
  });
  it("rate limits before contacting the password provider", async () => {
    mocks.limit.mockResolvedValue({ allowed: false });
    await expect(verifyDeletePassword("actor", "password", "/assets/target")).rejects.toMatchObject({ statusCode: 429 });
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
