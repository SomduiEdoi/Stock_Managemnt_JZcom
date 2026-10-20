import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { findLdapUserByEmail, LdapDirectoryError } from "@/lib/ldap";
import { WorkflowError } from "@/lib/workflow";
import { localCredentialsSchema, type CreateManagedUserInput } from "@/lib/user-account-schema";

export async function createLocalUser(tx: Prisma.TransactionClient, data: CreateManagedUserInput) {
  const credentials = localCredentialsSchema.parse(data);
  return tx.user.create({
    data: { provider: "LOCAL", email: null, name: credentials.username, localUsername: credentials.username, passwordHash: await hash(credentials.password, 12), isActive: true },
    select: { id: true },
  });
}

export async function createActiveDirectoryUser(tx: Prisma.TransactionClient, data: CreateManagedUserInput) {
  let directory;
  try { directory = await findLdapUserByEmail(data.email); }
  catch (error) {
    if (error instanceof LdapDirectoryError) throw new WorkflowError(error.message, 503, "AD_UNAVAILABLE");
    throw error;
  }
  if (!directory?.username) throw new WorkflowError("Email was not found in Active Directory.", 422, "AD_ACCOUNT_NOT_FOUND");
  const matches = await tx.user.count({ where: { OR: [
    { ldapUsername: { equals: directory.username, mode: "insensitive" } },
    ...(directory.upn ? [{ ldapUpn: { equals: directory.upn, mode: "insensitive" as const } }] : []),
  ] } });
  if (matches) throw new WorkflowError("Active Directory account already exists.", 409, "ACCOUNT_EXISTS");
  return tx.user.create({
    data: { provider: "AD", email: (directory.email ?? data.email).trim().toLowerCase(), name: data.name, ldapUsername: directory.username.toLowerCase(), ldapUpn: directory.upn?.toLowerCase() ?? null, passwordHash: null, localUsername: null, isActive: true },
    select: { id: true },
  });
}
