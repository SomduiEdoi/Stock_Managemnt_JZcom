import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeLdapUsername } from "../src/lib/ldap";

const prisma = new PrismaClient();

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const email = argument("--email")?.toLowerCase();
  const ldapUsername = normalizeLdapUsername(argument("--username") ?? "");

  if (!email || !ldapUsername) {
    throw new Error(
      "Usage: npm run db:link-ldap-user -- --email admin@example.com --username it01",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });

  if (!existingUser) {
    throw new Error(`Stock user not found for email: ${email}`);
  }

  const currentMapping = await prisma.user.findUnique({
    where: { ldapUsername },
    select: { email: true, id: true, name: true },
  });

  if (currentMapping && currentMapping.id !== existingUser.id) {
    throw new Error(
      `AD username "${ldapUsername}" is already linked to ${currentMapping.name} (${currentMapping.email}). Unlink it first before reassigning.`,
    );
  }

  let linkedUser;
  try {
    linkedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        ldapUsername,
        passwordHash: null,
      },
      select: { email: true, ldapUsername: true, name: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error(
        `AD username "${ldapUsername}" is already linked to another Stock user.`,
      );
    }

    throw error;
  }

  console.log(
    `Linked ${linkedUser.ldapUsername} to ${linkedUser.name} (${linkedUser.email}).`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
