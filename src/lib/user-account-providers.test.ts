import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ hash: vi.fn(), directory: vi.fn() }));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/ldap", () => ({ findLdapUserByEmail: mocks.directory, LdapDirectoryError: class extends Error {} }));
import { createActiveDirectoryUser, createLocalUser } from "./user-account-providers";
const data = { provider: "LOCAL" as const, email: "person@example.com", name: "Person", role: "ADMIN" as const, username: "person", password: "A-long-password-123!", confirmPassword: "A-long-password-123!" };
const create = vi.fn();
const count = vi.fn();
const tx = { user: { create, count } } as unknown as Prisma.TransactionClient;
beforeEach(() => { vi.clearAllMocks(); mocks.hash.mockResolvedValue("hashed"); create.mockResolvedValue({ id: "new" }); count.mockResolvedValue(0); });
describe("separate account provider services", () => {
  it("stores only a bcrypt hash for local accounts without LDAP", async () => {
    await createLocalUser(tx, data);
    expect(mocks.hash).toHaveBeenCalledWith(data.password, 12);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: "LOCAL", email: null, name: "person", localUsername: "person", passwordHash: "hashed" }), select: { id: true } });
    expect(JSON.stringify(create.mock.calls)).not.toContain(data.password);
    expect(mocks.directory).not.toHaveBeenCalled();
  });
  it("maps AD identity without local credentials", async () => {
    mocks.directory.mockResolvedValue({ email: data.email, username: "DirectoryUser", upn: "User@example.com" });
    await createActiveDirectoryUser(tx, { ...data, provider: "AD" });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: "AD", ldapUsername: "directoryuser", ldapUpn: "user@example.com", localUsername: null, passwordHash: null }), select: { id: true } });
    expect(mocks.hash).not.toHaveBeenCalled();
  });
  it("rejects missing AD accounts", async () => { mocks.directory.mockResolvedValue(null); await expect(createActiveDirectoryUser(tx, { ...data, provider: "AD" })).rejects.toThrow("not found"); expect(create).not.toHaveBeenCalled(); });
  it("rejects duplicate directory identities", async () => { mocks.directory.mockResolvedValue({ username: "person" }); count.mockResolvedValue(1); await expect(createActiveDirectoryUser(tx, { ...data, provider: "AD" })).rejects.toThrow("already exists"); expect(create).not.toHaveBeenCalled(); });
});
