import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query, loginThrottle: { deleteMany: mocks.cleanup } } }));
import { checkLoginLimit } from "./login-security";
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([{ attempts: 1, reset_at: new Date(Date.now() + 900000) }]); });
describe("persistent login throttling", () => {
  it("allows the first five account attempts", async () => {
    mocks.query.mockResolvedValueOnce([{ attempts: 5, reset_at: new Date(Date.now() + 900000) }]);
    expect(await checkLoginLimit("admin", "LOCAL", null)).toMatchObject({ allowed: true });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it("blocks the sixth account attempt with retry metadata", async () => {
    mocks.query.mockResolvedValueOnce([{ attempts: 6, reset_at: new Date(Date.now() + 900000) }]);
    expect(await checkLoginLimit("admin", "LOCAL", null)).toMatchObject({ allowed: false, retryAfter: expect.any(Number) });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("also enforces the trusted network bucket", async () => {
    mocks.query.mockResolvedValueOnce([{ attempts: 1, reset_at: new Date() }]).mockResolvedValueOnce([{ attempts: 31, reset_at: new Date(Date.now() + 900000) }]);
    expect(await checkLoginLimit("other", "AD", "192.0.2.1")).toMatchObject({ allowed: false });
  });
  it("normalizes account keys without storing the identifier", async () => {
    const one = await checkLoginLimit(" Admin ", "LOCAL", null);
    const two = await checkLoginLimit("admin", "LOCAL", null);
    expect(one.accountKey).toBe(two.accountKey);
    expect(one.accountKey).not.toContain("admin");
  });
});
