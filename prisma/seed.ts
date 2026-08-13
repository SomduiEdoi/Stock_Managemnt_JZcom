import bcrypt from "bcryptjs";
import {
  AssetTrackMethod,
  type OrganizationLevel,
  type OrganizationTag,
  PrismaClient,
  type RoleCode,
  type StockControllerTag,
} from "@prisma/client";

const prisma = new PrismaClient();
const defaultPassword = "ChangeMe123!";

type SeedUser = {
  name: string;
  email: string;
  position: string;
  roleCode: RoleCode;
  stockControllerTag?: StockControllerTag;
  organizationLevel?: OrganizationLevel;
  organizationTag?: OrganizationTag;
  azureAdObjectId?: string;
  permissions: Array<{
    domainCode: string;
    canView: boolean;
    canManage: boolean;
  }>;
};

const seedUsers: SeedUser[] = [
  {
    name: "Admin User",
    email: "admin@example.com",
    position: "Administrator",
    roleCode: "ADMIN",
    organizationLevel: "EXECUTIVE",
    organizationTag: "BSD_MANAGER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: true },
      { domainCode: "BSD", canView: true, canManage: true },
      { domainCode: "DL", canView: true, canManage: true },
    ],
  },
  {
    name: "Server Stock Controller",
    email: "server@example.com",
    position: "Server Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    stockControllerTag: "STOCK_CONTROLLER",
    organizationLevel: "STAFF",
    organizationTag: "S1_STAFF",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: false },
      { domainCode: "BSD", canView: true, canManage: false },
      { domainCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Network Stock Controller",
    email: "network@example.com",
    position: "Network Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    stockControllerTag: "STOCK_CONTROLLER",
    organizationLevel: "STAFF",
    organizationTag: "N1_STAFF",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: true },
      { domainCode: "BSD", canView: true, canManage: false },
      { domainCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Server Head Stock Controller",
    email: "server-head@example.com",
    position: "Server Head Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    stockControllerTag: "HEAD_STOCK_CONTROLLER",
    organizationLevel: "MANAGER",
    organizationTag: "SCN_MANAGER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: true },
      { domainCode: "NETWORK", canView: true, canManage: false },
      { domainCode: "BSD", canView: true, canManage: false },
      { domainCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Network Head Stock Controller",
    email: "network-head@example.com",
    position: "Network Head Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    stockControllerTag: "HEAD_STOCK_CONTROLLER",
    organizationLevel: "MANAGER",
    organizationTag: "SCN_MANAGER",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: true },
      { domainCode: "BSD", canView: true, canManage: false },
      { domainCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Viewer User",
    email: "viewer@example.com",
    position: "Staff",
    roleCode: "USER",
    organizationLevel: "STAFF",
    organizationTag: "BSD_STAFF",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: false },
      { domainCode: "BSD", canView: true, canManage: false },
      { domainCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Viewer Two",
    email: "viewer2@example.com",
    position: "Staff",
    roleCode: "USER",
    organizationLevel: "STAFF",
    organizationTag: "DL_STAFF",
    permissions: [
      { domainCode: "SERVER", canView: true, canManage: false },
      { domainCode: "NETWORK", canView: true, canManage: false },
      { domainCode: "BSD", canView: true, canManage: false },
      { domainCode: "DL", canView: true, canManage: false },
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
        inventoryFamily: AssetTrackMethod.SERIAL,
      },
      create: {
        code: "SERVER",
        name: "Server",
        prefix: "SV",
        description: "Server hardware, parts, and accessories.",
        inventoryFamily: AssetTrackMethod.SERIAL,
      },
    }),
    prisma.assetDomain.upsert({
      where: { code: "NETWORK" },
      update: {
        name: "Network",
        prefix: "NW",
        description: "Network hardware, modules, cables, and accessories.",
        inventoryFamily: AssetTrackMethod.SERIAL,
      },
      create: {
        code: "NETWORK",
        name: "Network",
        prefix: "NW",
        description: "Network hardware, modules, cables, and accessories.",
        inventoryFamily: AssetTrackMethod.SERIAL,
      },
    }),
    prisma.assetDomain.upsert({
      where: { code: "BSD" },
      update: {
        name: "BSD",
        description: "Business Support Dept. hardware stock.",
        inventoryFamily: AssetTrackMethod.QUANTITY,
      },
      create: {
        code: "BSD",
        name: "BSD",
        prefix: "BS",
        description: "Business Support Dept. hardware stock.",
        inventoryFamily: AssetTrackMethod.QUANTITY,
      },
    }),
    prisma.assetDomain.upsert({
      where: { code: "DL" },
      update: {
        name: "DL",
        description: "Delivery and Client warehouse stock.",
        inventoryFamily: AssetTrackMethod.QUANTITY,
      },
      create: {
        code: "DL",
        name: "DL",
        prefix: "DL",
        description: "Delivery and Client warehouse stock.",
        inventoryFamily: AssetTrackMethod.QUANTITY,
      },
    }),
  ]);
}

const bsdTaxonomy: Array<{ category: string; type: string; code: string }> = [
  { category: "Power", type: "UPS", code: "UPS" },
  { category: "Power", type: "Battery", code: "BAT" },
  { category: "Storage", type: "HDD", code: "HDD" },
  { category: "Storage", type: "SSD", code: "SSD" },
  { category: "Storage", type: "USB Flash Drive", code: "UFD" },
  { category: "Storage", type: "Memory Card", code: "MCD" },
  { category: "Memory", type: "RAM", code: "RAM" },
  { category: "Computer", type: "Notebook", code: "NBK" },
  { category: "Computer", type: "Mini PC", code: "MPC" },
  { category: "Computer", type: "PC/Desktop", code: "PCD" },
  { category: "Computer", type: "Monitor", code: "MON" },
  { category: "Computer", type: "Component", code: "CMP" },
  { category: "Cables", type: "HDMI", code: "HDM" },
  { category: "Cables", type: "USB Cable", code: "UCB" },
  { category: "Cables", type: "VGA Cable", code: "VGA" },
  { category: "Adapter & Converter", type: "Adapter", code: "ADP" },
  { category: "Accessories", type: "Mouse pad", code: "MPD" },
  { category: "Accessories", type: "Bag", code: "BAG" },
  { category: "Accessories", type: "Mouse", code: "MSE" },
  { category: "Accessories", type: "Headphones", code: "HPN" },
  { category: "Accessories", type: "Keypad", code: "KPD" },
  { category: "Accessories", type: "Enclosure", code: "ENC" },
  { category: "Accessories", type: "Office Accessory", code: "OFA" },
  { category: "Accessories", type: "switch", code: "SWT" },
];

async function upsertBsdTaxonomy(domainId: string) {
  const categories = new Map<string, string>();

  for (const item of bsdTaxonomy) {
    let categoryId = categories.get(item.category);

    if (!categoryId) {
      const category = await prisma.assetCategory.upsert({
        where: { domainId_name: { domainId, name: item.category } },
        update: { isActive: true },
        create: { domainId, isActive: true, name: item.category },
      });
      categoryId = category.id;
      categories.set(item.category, categoryId);
    }

    await prisma.assetType.upsert({
      where: { categoryId_name: { categoryId, name: item.type } },
      update: { isActive: true, trackMethod: AssetTrackMethod.QUANTITY },
      create: {
        categoryId,
        code: item.code,
        isActive: true,
        name: item.type,
        trackMethod: AssetTrackMethod.QUANTITY,
      },
    });
  }
}

const dlTaxonomy: Array<{ category: string; type: string; code: string }> = [
  { category: "Access Control", type: "Access Control", code: "ACT" },
  { category: "CCTV", type: "CCTV Equipment", code: "CCT" },
  { category: "Cable", type: "Back Box / Outlet Box", code: "BOX" },
  { category: "Cable", type: "Cable Tie / Cable Management", code: "CTL" },
  { category: "Cable", type: "Faceplate", code: "FAC" },
  { category: "Cable", type: "Fiber Adapter / Fiber Module", code: "FAM" },
  { category: "Cable", type: "Fiber Splice / Fiber Accessories", code: "FSP" },
  { category: "Cable", type: "LAN Cable", code: "LAN" },
  { category: "Cable", type: "Modular Jack / Keystone Jack", code: "MOJ" },
  { category: "Cable", type: "Modular Plug (RJ45 Plug)", code: "MOP" },
  { category: "Cable", type: "Patch Cord", code: "PCL" },
  { category: "Component", type: "Accessories", code: "ACC" },
  {
    category: "Electrical",
    type: "Electrical Cable / Electrical Material",
    code: "ECT",
  },
  { category: "Electrical", type: "Plug / Socket / Power Plug", code: "PUG" },
  { category: "Rack", type: "Rack", code: "RAK" },
  { category: "Rack", type: "Rack Accessories", code: "RAC" },
  { category: "Telephone", type: "Telephone Accessories", code: "TEL" },
];

async function upsertDlTaxonomy(domainId: string) {
  const categories = new Map<string, string>();

  for (const item of dlTaxonomy) {
    let categoryId = categories.get(item.category);

    if (!categoryId) {
      const category = await prisma.assetCategory.upsert({
        where: { domainId_name: { domainId, name: item.category } },
        update: { isActive: true },
        create: { domainId, isActive: true, name: item.category },
      });
      categoryId = category.id;
      categories.set(item.category, categoryId);
    }

    await prisma.assetType.upsert({
      where: { categoryId_name: { categoryId, name: item.type } },
      update: { isActive: true, trackMethod: AssetTrackMethod.QUANTITY },
      create: {
        categoryId,
        code: item.code,
        isActive: true,
        name: item.type,
        trackMethod: AssetTrackMethod.QUANTITY,
      },
    });
  }
}

async function upsertSeedUser(
  user: SeedUser,
  passwordHash: string,
  roleByCode: Map<RoleCode, string>,
  domainByCode: Map<string, string>,
) {
  const identityData = user.azureAdObjectId
    ? { azureAdObjectId: user.azureAdObjectId }
    : {};

  const createdUser = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      isActive: true,
      name: user.name,
      organizationLevel: user.organizationLevel,
      organizationTag: user.organizationTag,
      passwordHash,
      position: user.position,
      projectTag: null,
      stockControllerTag: user.roleCode === "STOCK_CONTROLLER" ? user.stockControllerTag ?? "STOCK_CONTROLLER" : null,
      ...identityData,
    },
    create: {
      email: user.email,
      isActive: true,
      name: user.name,
      organizationLevel: user.organizationLevel,
      organizationTag: user.organizationTag,
      passwordHash,
      position: user.position,
      projectTag: null,
      stockControllerTag: user.roleCode === "STOCK_CONTROLLER" ? user.stockControllerTag ?? "STOCK_CONTROLLER" : null,
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
  const bsdDomainId = domainByCode.get("BSD");
  const dlDomainId = domainByCode.get("DL");

  if (!bsdDomainId) {
    throw new Error("Missing domain BSD");
  }
  if (!dlDomainId) {
    throw new Error("Missing domain DL");
  }

  await upsertBsdTaxonomy(bsdDomainId);
  await upsertDlTaxonomy(dlDomainId);

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
