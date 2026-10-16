import { beforeEach, describe, expect, it, vi } from "vitest";

const { bind, search, unbind, Client } = vi.hoisted(() => {
  const bind = vi.fn();
  const search = vi.fn();
  const unbind = vi.fn();
  const Client = vi.fn(() => ({ bind, search, unbind }));

  return { bind, search, unbind, Client };
});

vi.mock("ldapts", () => ({ Client }));

import { authenticateWithLdap, findLdapUserByEmail } from "./ldap";

describe("authenticateWithLdap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LDAP_URL", "ldap://172.16.3.179:389");
    vi.stubEnv("LDAP_DOMAIN", "ad2012r2.local");
    vi.stubEnv("LDAP_BASE_DN", "DC=ad2012r2,DC=local");
    vi.stubEnv("LDAP_USER_SEARCH_BASE", "OU=IT,DC=ad2012r2,DC=local");
    vi.stubEnv("LDAP_VERIFY_BIND_DN", "ldap-reader@ad2012r2.local");
    vi.stubEnv("LDAP_VERIFY_BIND_PASSWORD", "secret");
    bind.mockResolvedValue(undefined);
    search.mockResolvedValue({
      searchEntries: [
        {
          sAMAccountName: ["it01"],
          displayName: ["IT User 01"],
          mail: ["it01@ad2012r2.local"],
        },
      ],
    });
    unbind.mockResolvedValue(undefined);
  });

  it("binds with the email as a domain UPN and reads the AD user", async () => {
    await expect(authenticateWithLdap("it01@ad2012r2.local", "secret")).resolves.toEqual({
      email: "it01@ad2012r2.local",
      name: "IT User 01",
      username: "it01",
    });

    expect(bind).toHaveBeenCalledWith("it01@ad2012r2.local", "secret");
    expect(search).toHaveBeenCalledWith("OU=IT,DC=ad2012r2,DC=local", {
      attributes: ["sAMAccountName", "displayName", "cn", "mail", "userPrincipalName"],
      filter: "(&(objectCategory=person)(|(mail=it01@ad2012r2.local)(userPrincipalName=it01@ad2012r2.local)(sAMAccountName=it01)))",
      scope: "sub",
      sizeLimit: 2,
    });
    expect(unbind).toHaveBeenCalledOnce();
  });

  it("accepts DOMAIN\\username without changing the bind identity", async () => {
    search.mockResolvedValue({
      searchEntries: [
        { sAMAccountName: ["it02"], cn: ["IT User 02"] },
      ],
    });

    await expect(
      authenticateWithLdap("AD2012R2\\it02", "secret"),
    ).resolves.toEqual({
      email: null,
      name: "IT User 02",
      username: "it02",
    });

    expect(bind).toHaveBeenCalledWith("ad2012r2\\it02", "secret");
  });

  it("accepts the domain slash username format used by the AD handoff", async () => {
    search.mockResolvedValue({
      searchEntries: [{ sAMAccountName: ["it02"], cn: ["IT User 02"] }],
    });

    await expect(
      authenticateWithLdap("ad2012r2.local/it02", "secret"),
    ).resolves.toMatchObject({ username: "it02" });

    expect(bind).toHaveBeenCalledWith("it02@ad2012r2.local", "secret");
    expect(search).toHaveBeenCalledWith(
      "OU=IT,DC=ad2012r2,DC=local",
      expect.objectContaining({
        filter: "(&(objectCategory=person)(|(mail=ad2012r2.local/it02)(userPrincipalName=ad2012r2.local/it02)(sAMAccountName=it02)))",
      }),
    );
  });

  it("normalizes UPN usernames case-insensitively for mapping", async () => {
    search.mockResolvedValue({
      searchEntries: [{ sAMAccountName: ["it02"], cn: ["IT User 02"] }],
    });

    await expect(
      authenticateWithLdap("IT02@ad2012r2.local", "secret"),
    ).resolves.toMatchObject({ username: "it02" });

    expect(search).toHaveBeenCalledWith(
      "OU=IT,DC=ad2012r2,DC=local",
      expect.objectContaining({
        filter: "(&(objectCategory=person)(|(mail=it02@ad2012r2.local)(userPrincipalName=it02@ad2012r2.local)(sAMAccountName=it02)))",
      }),
    );
  });

  it("returns null when AD rejects the credentials and still closes the client", async () => {
    bind.mockRejectedValue(Object.assign(new Error("invalid credentials"), { code: 49 }));

    await expect(authenticateWithLdap("it01", "wrong")).resolves.toBeNull();
    expect(search).not.toHaveBeenCalled();
    expect(unbind).toHaveBeenCalledOnce();
  });
  it("reports directory outages separately from invalid credentials", async () => {
    bind.mockRejectedValue(Object.assign(new Error("private network details"), { code: "ECONNREFUSED" }));
    await expect(authenticateWithLdap("it01", "secret")).rejects.toThrow("Active Directory is unavailable");
    expect(unbind).toHaveBeenCalledOnce();
  });
});

describe("findLdapUserByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LDAP_URL", "ldap://172.16.3.179:389");
    vi.stubEnv("LDAP_DOMAIN", "ad2012r2.local");
    vi.stubEnv("LDAP_BASE_DN", "DC=ad2012r2,DC=local");
    vi.stubEnv("LDAP_USER_SEARCH_BASE", "OU=IT,DC=ad2012r2,DC=local");
    bind.mockResolvedValue(undefined);
    search.mockResolvedValue({
      searchEntries: [
        {
          sAMAccountName: ["it01"],
          displayName: ["IT User 01"],
          mail: ["it01@ad2012r2.local"],
        },
      ],
    });
    unbind.mockResolvedValue(undefined);
  });

  it("searches AD by mail or userPrincipalName", async () => {
    await expect(findLdapUserByEmail("IT01@AD2012R2.LOCAL")).resolves.toEqual({
      email: "it01@ad2012r2.local",
      name: "IT User 01",
      username: "it01",
    });

    expect(bind).toHaveBeenCalledWith("ldap-reader@ad2012r2.local", "secret");
    expect(search).toHaveBeenCalledWith("OU=IT,DC=ad2012r2,DC=local", {
      attributes: ["sAMAccountName", "displayName", "cn", "mail", "userPrincipalName"],
      filter: "(&(objectCategory=person)(|(mail=it01@ad2012r2.local)(userPrincipalName=it01@ad2012r2.local)))",
      scope: "sub",
      sizeLimit: 2,
    });
    expect(unbind).toHaveBeenCalledOnce();
  });
});
