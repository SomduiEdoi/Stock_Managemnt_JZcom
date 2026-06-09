import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const defaultPassword = "ChangeMe123!";

type RoleCode = "ADMIN" | "STOCK_OWNER" | "VIEWER";
type AssetDomainCode = "SERVER" | "NETWORK";

type SeedUser = {
  name: string;
  email: string;
  roleCode: RoleCode;
  permissions: Array<{
    domainCode: AssetDomainCode;
    canView: boolean;
    canManage: boolean;
  }>;
};

const seedUsers: SeedUser[] = [
  {
    name: "P' Oak",
    email: "oak@example.com",
    roleCode: "ADMIN",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: true },
    ],
  },
  {
    name: "P' Arm",
    email: "arm@example.com",
    roleCode: "STOCK_OWNER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: false },
    ],
  },
  {
    name: "P' Mek",
    email: "mek@example.com",
    roleCode: "STOCK_OWNER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: true },
    ],
  },
  {
    name: "Viewer",
    email: "viewer@example.com",
    roleCode: "VIEWER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: false },
    ],
  },
];

async function upsertRoles() {
  return Promise.all([
    prisma.role.upsert({
      where: { code: "ADMIN" },
      update: {
        name: "Admin",
        description: "Can manage all domains, users, imports, and settings.",
      },
      create: {
        code: "ADMIN",
        name: "Admin",
        description: "Can manage all domains, users, imports, and settings.",
      },
    }),
    prisma.role.upsert({
      where: { code: "STOCK_OWNER" },
      update: {
        name: "Stock Owner",
        description: "Can manage assets in assigned domains.",
      },
      create: {
        code: "STOCK_OWNER",
        name: "Stock Owner",
        description: "Can manage assets in assigned domains.",
      },
    }),
    prisma.role.upsert({
      where: { code: "VIEWER" },
      update: {
        name: "Viewer",
        description: "Read-only access to asset data.",
      },
      create: {
        code: "VIEWER",
        name: "Viewer",
        description: "Read-only access to asset data.",
      },
    }),
  ]);
}

async function upsertDomains() {
  return Promise.all([
    prisma.assetDomain.upsert({
      where: { code: "SERVER" },
      update: {
        name: "Server",
        description: "Server hardware, parts, and accessories.",
      },
      create: {
        code: "SERVER",
        name: "Server",
        description: "Server hardware, parts, and accessories.",
      },
    }),
    prisma.assetDomain.upsert({
      where: { code: "NETWORK" },
      update: {
        name: "Network",
        description: "Network hardware, modules, cables, and accessories.",
      },
      create: {
        code: "NETWORK",
        name: "Network",
        description: "Network hardware, modules, cables, and accessories.",
      },
    }),
  ]);
}

async function upsertSeedUser(
  user: SeedUser,
  passwordHash: string,
  roleByCode: Map<RoleCode, string>,
  domainByCode: Map<AssetDomainCode, string>,
) {
  const createdUser = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name,
      passwordHash,
      isActive: true,
    },
    create: {
      name: user.name,
      email: user.email,
      passwordHash,
      isActive: true,
    },
  });

  const roleId = roleByCode.get(user.roleCode);
  if (!roleId) {
    throw new Error(`Missing role ${user.roleCode}`);
  }

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: createdUser.id,
        roleId,
      },
    },
    update: {},
    create: {
      userId: createdUser.id,
      roleId,
    },
  });

  for (const permission of user.permissions) {
    const domainId = domainByCode.get(permission.domainCode);
    if (!domainId) {
      throw new Error(`Missing domain ${permission.domainCode}`);
    }

    await prisma.userDomainPermission.upsert({
      where: {
        userId_domainId: {
          userId: createdUser.id,
          domainId,
        },
      },
      update: {
        canView: permission.canView,
        canManage: permission.canManage,
      },
      create: {
        userId: createdUser.id,
        domainId,
        canView: permission.canView,
        canManage: permission.canManage,
      },
    });
  }

  return createdUser;
}

async function main() {
  const [roles, domains] = await Promise.all([upsertRoles(), upsertDomains()]);
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const roleByCode = new Map(roles.map((role) => [role.code, role.id]));
  const domainByCode = new Map(
    domains.map((domain) => [domain.code, domain.id]),
  );

  for (const user of seedUsers) {
    await upsertSeedUser(user, passwordHash, roleByCode, domainByCode);
  }

  console.info("Seed complete.");
  console.info(`Default password for seed users: ${defaultPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
