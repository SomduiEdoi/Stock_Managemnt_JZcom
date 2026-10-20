import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ local: vi.fn(), ad: vi.fn(), directory: vi.fn(), compare: vi.fn(), audit: vi.fn(), update: vi.fn(), limit: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.local, findMany: mocks.ad, update: mocks.update }, loginAudit: { create: mocks.audit }, loginThrottle: { deleteMany: mocks.reset } } }));
vi.mock("bcryptjs", () => ({ hash: vi.fn().mockResolvedValue("dummy"), compare: mocks.compare }));
vi.mock("@/lib/login-security", () => ({ checkLoginLimit: mocks.limit }));
vi.mock("@/lib/auth", () => ({ getUserFromSessionToken: vi.fn().mockResolvedValue({ id: "admin" }) }));
vi.mock("@/lib/session", () => ({ SESSION_COOKIE_NAME: "stock_session", createSessionToken: vi.fn().mockReturnValue("signed-token"), sessionCookieOptions: vi.fn().mockReturnValue({ httpOnly: true }) }));
vi.mock("@/lib/ldap", async (original) => {
  const actual = await original<typeof import("@/lib/ldap")>();
  return { ...actual, authenticateWithLdap: mocks.directory };
});
import { LdapDirectoryError } from "@/lib/ldap";
import { POST } from "./route";
const call = (mode = "LOCAL", email = "admin") => POST(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, email, password: "test-password-1234" }) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue({ allowed: true, accountKey: "key" });
  mocks.local.mockResolvedValue({ id: "local", isActive: true, passwordHash: "hash", roles: [{ role: { code: "ADMIN" } }] });
  mocks.compare.mockResolvedValue(true);
});
describe("explicit AD and local login", () => {
  it("requires exactly one mapped existing account", async () => {
    mocks.directory.mockResolvedValue({ username: "chutithep", upn: "chutithep@jzcom.co.th" });
    mocks.ad.mockResolvedValue([{ id: "existing-user" }]);
    expect((await call("AD", "Chutithep")).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "existing-user" }, data: { lastLoginAt: expect.any(Date) } });
  });
  it.each([{ matches: [] }, { matches: [{ id: "a" }, { id: "b" }] }])("denies missing or conflicting mappings", async ({ matches }) => {
    mocks.directory.mockResolvedValue({ username: "unmapped", upn: "unmapped@jzcom.co.th" });
    mocks.ad.mockResolvedValue(matches);
    const response = await call("AD", "unmapped");
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("signs in a local administrator without contacting AD", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(mocks.directory).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith({ data: { userId: "local", mode: "LOCAL", result: "SUCCESS" } });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("does not allow local login until a password is set", async () => {
    mocks.local.mockResolvedValue({ id: "local", isActive: true, passwordHash: null, roles: [{ role: { code: "ADMIN" } }] });
    expect((await call()).status).toBe(401);
  });
  it.each(["USER", "STOREMAN", "ADMIN"])("permits active local %s accounts", async (code) => {
    mocks.local.mockResolvedValue({ id: "local", isActive: true, passwordHash: "hash", roles: [{ role: { code } }] });
    expect((await call()).status).toBe(200);
    expect(mocks.local).toHaveBeenCalledWith(expect.objectContaining({ where: { localUsername: "admin", provider: "LOCAL" } }));
    expect(mocks.directory).not.toHaveBeenCalled();
  });
  it("blocks inactive local administrators", async () => {
    mocks.local.mockResolvedValue({ id: "local", isActive: false, passwordHash: "hash", roles: [{ role: { code: "ADMIN" } }] });
    expect((await call()).status).toBe(401);
  });
  it("stops authentication when rate limited", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfter: 60 });
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.directory).not.toHaveBeenCalled();
  });
  it("returns 503 for an AD outage without falling back to local", async () => {
    mocks.directory.mockRejectedValue(new LdapDirectoryError("private diagnostic"));
    const response = await call("AD", "user@example.test");
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private diagnostic");
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("returns 401 for incorrect AD credentials without local fallback", async () => {
    mocks.directory.mockResolvedValue(null);
    expect((await call("AD", "user@example.test")).status).toBe(401);
    expect(mocks.local).not.toHaveBeenCalled();
  });
});
