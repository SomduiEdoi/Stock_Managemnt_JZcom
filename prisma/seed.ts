import bcrypt from "bcryptjs";
import {
  type AssetDomainCode,
  PrismaClient,
  type RoleCode,
} from "@prisma/client";

const prisma = new PrismaClient();
const defaultPassword = "ChangeMe123!";

type SeedUser = {
  name: string;
  email: string;
  organizationTag: string;
  position: string;
  roleCode: RoleCode;
  azureAdObjectId?: string;
  permissions: Array<{
    domainCode: AssetDomainCode;
    canView: boolean;
    canManage: boolean;
  }>;
};

const seedUsers: SeedUser[] = [
  {
    name: "Admin",
    email: "admin@example.com",
    organizationTag: "EXECUTIVE",
    position: "Administrator",
    roleCode: "ADMIN",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: true },
    ],
  },
  {
    name: "Server Stock Controller",
    email: "server@example.com",
    organizationTag: "S1_STAFF",
    position: "Server Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: false },
    ],
  },
  {
    name: "Network Stock Controller",
    email: "network@example.com",
    organizationTag: "N1_STAFF",
    position: "Network Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: true },
    ],
  },
  {
    name: "Staff User",
    email: "viewer@example.com",
    organizationTag: "STAFF",
    position: "Staff",
    roleCode: "USER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: false },
    ],
  },
  {
    name: "Viewer 2",
    email: "viewer2@example.com",
    organizationTag: "STAFF",
    position: "Staff",
    roleCode: "USER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: false },
    ],
  },
];

async function upsertRoles() {
  const roles: Array<{
    code: RoleCode;
    name: string;
    description: string;
  }> = [
    {
      code: "ADMIN",
      name: "Admin",
      description: "Can manage all domains, users, imports, and settings.",
    },
    {
      code: "STOCK_CONTROLLER",
      name: "Stock Controller",
      description: "Can manage assigned inventory domains and view other allowed domains.",
    },
    {
      code: "USER",
      name: "User",
      description: "Can view assets and submit asset requests.",
    },
  ];

  return Promise.all(
    roles.map((role) =>
      prisma.role.upsert({
        where: { code: role.code },
        update: {
          name: role.name,
          description: role.description,
        },
        create: role,
      }),
    ),
  );
}

async function upsertDomains() {
  return Promise.all([
    prisma.assetDomain.upsert({
      where: { code: "SERVER" },
      update: {
        name: "Server",
        prefix: "SV",
        description: "Server hardware, parts, and accessories.",
      },
      create: {
        code: "SERVER",
        name: "Server",
        prefix: "SV",
        description: "Server hardware, parts, and accessories.",
      },
    }),
    prisma.assetDomain.upsert({
      where: { code: "NETWORK" },
      update: {
        name: "Network",
        prefix: "NW",
        description: "Network hardware, modules, cables, and accessories.",
      },
      create: {
        code: "NETWORK",
        name: "Network",
        prefix: "NW",
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
  const identityData = user.azureAdObjectId
    ? { azureAdObjectId: user.azureAdObjectId }
    : {};

  const createdUser = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      isActive: true,
      name: user.name,
      organizationTag: user.organizationTag,
      passwordHash,
      position: user.position,
      ...identityData,
    },
    create: {
      email: user.email,
      isActive: true,
      name: user.name,
      organizationTag: user.organizationTag,
      passwordHash,
      position: user.position,
      ...identityData,
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

  await prisma.userRole.deleteMany({
    where: {
      roleId: { not: roleId },
      userId: createdUser.id,
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
