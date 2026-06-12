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
    name: "P' Oak",
    email: "oak@example.com",
    position: "Administrator",
    roleCode: "ADMIN",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: true },
    ],
  },
  {
    name: "P' Arm",
    email: "arm@example.com",
    position: "Server Stock Owner",
    roleCode: "SERVER_OWNER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: false },
    ],
  },
  {
    name: "P' Mek",
    email: "mek@example.com",
    position: "Network Stock Owner",
    roleCode: "NETWORK_OWNER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: true },
    ],
  },
  {
    name: "Staff User",
    email: "viewer@example.com",
    position: "Staff",
    roleCode: "STAFF",
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
      code: "SERVER_OWNER",
      name: "Server Owner",
      description: "Can manage Server assets and view assigned domains.",
    },
    {
      code: "NETWORK_OWNER",
      name: "Network Owner",
      description: "Can manage Network assets and view assigned domains.",
    },
    {
      code: "STAFF",
      name: "Staff",
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
  const identityData = user.azureAdObjectId
    ? { azureAdObjectId: user.azureAdObjectId }
    : {};

  const createdUser = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      isActive: true,
      name: user.name,
      passwordHash,
      position: user.position,
      ...identityData,
    },
    create: {
      email: user.email,
      isActive: true,
      name: user.name,
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
