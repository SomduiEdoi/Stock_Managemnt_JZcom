import { Client } from "ldapts";
import { readFileSync } from "node:fs";

export type LdapUser = {
  email: string | null;
  name: string;
  username: string;
};

type LdapConfig = {
  baseDn: string;
  domain: string;
  searchBase: string;
  url: string;
};

function getConfig(): LdapConfig {
  const url = process.env.LDAP_URL;
  const domain = process.env.LDAP_DOMAIN;
  const baseDn = process.env.LDAP_BASE_DN;

  if (!url || !domain || !baseDn) {
    throw new Error("LDAP_URL, LDAP_DOMAIN, and LDAP_BASE_DN are required.");
  }

  const searchBase = process.env.LDAP_USER_SEARCH_BASE || baseDn;

  if (process.env.NODE_ENV === "production" && url.startsWith("ldap://") && process.env.LDAP_ALLOW_INSECURE !== "true") {
    throw new Error("Production LDAP must use LDAPS or explicitly allow insecure LDAP.");
  }

  return { baseDn, domain, searchBase, url };
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
  username: string,
  password: string,
): Promise<LdapUser | null> {
  const config = getConfig();
  const normalizedUsername = normalizeLdapUsername(username);

  if (!normalizedUsername || !password) {
    return null;
  }

  const client = createClient(config);

  try {
    await client.bind(bindUsername(username, config.domain), password);

    const result = await client.search(config.searchBase, {
      scope: "sub",
      filter: `(&(objectCategory=person)(sAMAccountName=${escapeFilterValue(normalizedUsername)}))`,
      attributes: ["sAMAccountName", "displayName", "cn", "mail", "userPrincipalName"],
      sizeLimit: 2,
    });

    const entry = result.searchEntries[0];

    return entry ? toLdapUser(entry as unknown as Record<string, unknown>, normalizedUsername) : {
      email: username.includes("@") ? username.trim().toLowerCase() : null,
      name: normalizedUsername,
      username: normalizedUsername,
    };
  } catch {
    return null;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
