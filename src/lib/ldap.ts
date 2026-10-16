import { Client } from "ldapts";
import { readFileSync } from "node:fs";

export type LdapUser = {
  email: string | null;
  name: string;
  username: string;
};

export class LdapDirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LdapDirectoryError";
  }
}

type LdapConfig = {
  baseDn: string;
  domain: string;
  searchBase: string;
  url: string;
  verifyBindDn?: string;
  verifyBindPassword?: string;
};

function getConfig(): LdapConfig {
  const url = process.env.LDAP_URL;
  const domain = process.env.LDAP_DOMAIN;
  const baseDn = process.env.LDAP_BASE_DN;

  if (!url || !domain || !baseDn) {
    throw new LdapDirectoryError("Active Directory configuration is unavailable.");
  }

  const searchBase = process.env.LDAP_USER_SEARCH_BASE || baseDn;
  const verifyBindDn = process.env.LDAP_VERIFY_BIND_DN;
  const verifyBindPassword = process.env.LDAP_VERIFY_BIND_PASSWORD;

  if (process.env.NODE_ENV === "production" && url.startsWith("ldap://") && process.env.LDAP_ALLOW_INSECURE !== "true") {
    throw new LdapDirectoryError("Active Directory secure connection is not configured.");
  }

  return {
    baseDn,
    domain,
    searchBase,
    url,
    verifyBindDn,
    verifyBindPassword,
  };
}

function escapeFilterValue(value: string) {
  return value.replace(/[\\*()\0]/g, (character) => {
    const escaped = {
      "\\": "\\5c",
      "*": "\\2a",
      "(": "\\28",
      ")": "\\29",
      "\0": "\\00",
    } as const;

    return escaped[character as keyof typeof escaped];
  });
}

export function normalizeLdapUsername(username: string) {
  const value = username.trim();

  if (value.includes("\\") || value.includes("/")) {
    return value.slice(Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/")) + 1).toLowerCase();
  }

  if (value.includes("@")) {
    return value.slice(0, value.indexOf("@")).toLowerCase();
  }

  return value.toLowerCase();
}

function bindUsername(username: string, domain: string) {
  const value = username.trim();

  if (value.includes("@")) {
    return value;
  }

  if (value.includes("\\")) {
    return value;
  }

  if (value.includes("/")) {
    return `${value.slice(value.lastIndexOf("/") + 1)}@${domain}`;
  }

  return `${value}@${domain}`;
}

function firstString(value: unknown) {
  if (Array.isArray(value)) {
    return firstString(value[0]);
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createClient(config: LdapConfig) {
  const url = new URL(config.url);
  const caPath = process.env.LDAP_CA_CERT_PATH;
  const ca = url.protocol === "ldaps:" && caPath ? readFileSync(caPath) : undefined;

  return new Client({
    url: config.url,
    timeout: Number(process.env.LDAP_TIMEOUT_MS ?? 5000),
    connectTimeout: Number(process.env.LDAP_CONNECT_TIMEOUT_MS ?? 5000),
    ...(url.protocol === "ldaps:" && ca
      ? { tlsOptions: { ca: [ca], minVersion: "TLSv1.2" } }
      : {}),
  });
}

function toLdapUser(entry: Record<string, unknown>, fallbackUsername: string): LdapUser {
  const attributes = entry;
  const username = firstString(attributes.sAMAccountName) ?? fallbackUsername;
  const email = firstString(attributes.mail) ?? firstString(attributes.userPrincipalName);
  const name =
    firstString(attributes.displayName) ??
    firstString(attributes.cn) ??
    username;

  return { email, name, username };
}

export async function authenticateWithLdap(
  email: string,
  password: string,
): Promise<LdapUser | null> {
  const config = getConfig();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = normalizeLdapUsername(normalizedEmail);

  if (!normalizedEmail || !password) {
    return null;
  }

  let client: ReturnType<typeof createClient>;
  try { client = createClient(config); }
  catch { throw new LdapDirectoryError("Active Directory connection is unavailable."); }

  try {
    await client.bind(bindUsername(normalizedEmail, config.domain), password);

    const result = await client.search(config.searchBase, {
      scope: "sub",
      filter: `(&(objectCategory=person)(|(mail=${escapeFilterValue(normalizedEmail)})(userPrincipalName=${escapeFilterValue(normalizedEmail)})(sAMAccountName=${escapeFilterValue(normalizedUsername)})))`,
      attributes: ["sAMAccountName", "displayName", "cn", "mail", "userPrincipalName"],
      sizeLimit: 2,
    });

    const entry = result.searchEntries[0];

    return entry ? toLdapUser(entry, normalizedUsername) : {
      email: normalizedEmail,
      name: normalizedUsername,
      username: normalizedUsername,
    };
  } catch (error) {
    const details = error as { code?: number; name?: string };
    if (details.code === 49 || details.name === "InvalidCredentialsError") return null;
    throw new LdapDirectoryError("Active Directory is unavailable. Please try again later.");
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export async function findLdapUserByEmail(email: string): Promise<LdapUser | null> {
  const config = getConfig();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = normalizeLdapUsername(normalizedEmail);

  if (!normalizedEmail) {
    return null;
  }

  if (!config.verifyBindDn || !config.verifyBindPassword) {
    throw new LdapDirectoryError(
      "Active Directory verification requires LDAP_VERIFY_BIND_DN and LDAP_VERIFY_BIND_PASSWORD.",
    );
  }

  const client = createClient(config);

  try {
    await client.bind(config.verifyBindDn, config.verifyBindPassword);

    const result = await client.search(config.searchBase, {
      scope: "sub",
      filter: `(&(objectCategory=person)(|(mail=${escapeFilterValue(normalizedEmail)})(userPrincipalName=${escapeFilterValue(normalizedEmail)})))`,
      attributes: ["sAMAccountName", "displayName", "cn", "mail", "userPrincipalName"],
      sizeLimit: 2,
    });
    const entry = result.searchEntries[0];

    return entry
      ? toLdapUser(entry, normalizedUsername)
      : null;
  } catch (error) {
    if (error instanceof LdapDirectoryError) {
      throw error;
    }

    throw new LdapDirectoryError("Unable to query Active Directory right now.");
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
