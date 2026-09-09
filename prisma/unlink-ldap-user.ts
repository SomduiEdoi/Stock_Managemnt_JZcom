import { PrismaClient } from "@prisma/client";
import { normalizeLdapUsername } from "../src/lib/ldap";

const prisma = new PrismaClient();

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const email = argument("--email")?.toLowerCase();
  const rawUsername = argument("--username");
  const ldapUsername = rawUsername ? normalizeLdapUsername(rawUsername) : "";

  if ((email && ldapUsername) || (!email && !ldapUsername)) {
    throw new Error(
      "Provide exactly one selector: --email user@example.com or --username it01",
    );
  }

  const user = await prisma.user.findUnique({
    where: email ? { email } : { ldapUsername },
    select: { email: true, id: true, ldapUsername: true, name: true },
  });

  if (!user) {
    throw new Error(
      email
        ? `Stock user not found for email: ${email}`
        : `No Stock user is linked to AD username: ${ldapUsername}`,
    );
  }

  if (!user.ldapUsername) {
    console.log(`No AD mapping to unlink for ${user.name} (${user.email}).`);
    return;
  }

  const adminRole = await prisma.role.findUnique({
    where: { code: "ADMIN" },
    select: { id: true },
  });
  const activeAdminCount = adminRole
    ? await prisma.user.count({
        where: {
          isActive: true,
          roles: { some: { roleId: adminRole.id } },
        },
      })
    : 0;
  const isAdmin = adminRole
    ? await prisma.userRole.findFirst({
        where: { roleId: adminRole.id, userId: user.id },
        select: { userId: true },
      })
    : null;

  if (isAdmin && activeAdminCount <= 1) {
    throw new Error("Cannot unlink the last active Admin account.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { ldapUsername: null, passwordHash: null },
  });

  console.log(`Unlinked ${user.ldapUsername} from ${user.name} (${user.email}).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
