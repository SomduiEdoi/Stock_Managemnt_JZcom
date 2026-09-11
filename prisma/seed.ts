import bcrypt from "bcryptjs";
import {
  AssetTrackMethod,
  type OrganizationLevel,
  type OrganizationTag,
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
  organizationLevel?: OrganizationLevel;
  organizationTag?: OrganizationTag;
  organizationAssignments?: Array<{
    level: OrganizationLevel;
    tag: OrganizationTag;
    isPrimary?: boolean;
  }>;
  azureAdObjectId?: string;
  permissions: Array<{
    warehouseCode: string;
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
      { warehouseCode: "SERVER", canView: true, canManage: true },
      { warehouseCode: "NETWORK", canView: true, canManage: true },
      { warehouseCode: "BSD", canView: true, canManage: true },
      { warehouseCode: "DL", canView: true, canManage: true },
      { warehouseCode: "SALE_STOCK", canView: true, canManage: true },
    ],
  },
  {
    name: "Joy",
    email: "joy@example.com",
    position: "Sale Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    organizationLevel: "STAFF",
    organizationTag: "BSD_STAFF",
    permissions: [
      { warehouseCode: "SERVER", canView: true, canManage: false },
      { warehouseCode: "NETWORK", canView: true, canManage: false },
      { warehouseCode: "BSD", canView: true, canManage: false },
      { warehouseCode: "DL", canView: true, canManage: false },
      { warehouseCode: "SALE_STOCK", canView: true, canManage: true },
    ],
  },
  {
    name: "Server Stock Controller",
    email: "server@example.com",
    position: "Server Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    organizationLevel: "STAFF",
    organizationTag: "S1_STAFF",
    permissions: [
      { warehouseCode: "SERVER", canView: true, canManage: true },
      { warehouseCode: "NETWORK", canView: true, canManage: false },
      { warehouseCode: "BSD", canView: true, canManage: false },
      { warehouseCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Network Stock Controller",
    email: "network@example.com",
    position: "Network Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    organizationLevel: "STAFF",
    organizationTag: "N1_STAFF",
    permissions: [
      { warehouseCode: "SERVER", canView: true, canManage: false },
      { warehouseCode: "NETWORK", canView: true, canManage: true },
      { warehouseCode: "BSD", canView: true, canManage: false },
      { warehouseCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Server Head Stock Controller",
    email: "server-head@example.com",
    position: "Server Head Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    organizationLevel: "MANAGER",
    organizationTag: "SCN_MANAGER",
    permissions: [
      { warehouseCode: "SERVER", canView: true, canManage: true },
      { warehouseCode: "NETWORK", canView: true, canManage: false },
      { warehouseCode: "BSD", canView: true, canManage: false },
      { warehouseCode: "DL", canView: true, canManage: false },
    ],
  },
  {
    name: "Network Head Stock Controller",
    email: "network-head@example.com",
    position: "Network Head Stock Controller",
    roleCode: "STOCK_CONTROLLER",
    organizationLevel: "MANAGER",
    organizationTag: "SCN_MANAGER",
    permissions: [
      { warehouseCode: "SERVER", canView: true, canManage: false },
      { warehouseCode: "NETWORK", canView: true, canManage: true },
      { warehouseCode: "BSD", canView: true, canManage: false },
      { warehouseCode: "DL", canView: true, canManage: false },
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
      { warehouseCode: "SERVER", canView: true, canManage: false },
      { warehouseCode: "NETWORK", canView: true, canManage: false },
      { warehouseCode: "BSD", canView: true, canManage: false },
      { warehouseCode: "DL", canView: true, canManage: false },
      { warehouseCode: "SALE_STOCK", canView: true, canManage: false },
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
      { warehouseCode: "SERVER", canView: true, canManage: false },
      { warehouseCode: "NETWORK", canView: true, canManage: false },
      { warehouseCode: "BSD", canView: true, canManage: false },
      { warehouseCode: "DL", canView: true, canManage: false },
      { warehouseCode: "SALE_STOCK", canView: true, canManage: false },
    ],
  },
];

const allViewerPermissions = [
  { warehouseCode: "SERVER", canView: true, canManage: false },
  { warehouseCode: "NETWORK", canView: true, canManage: false },
  { warehouseCode: "BSD", canView: true, canManage: false },
  { warehouseCode: "DL", canView: true, canManage: false },
  { warehouseCode: "SALE_STOCK", canView: true, canManage: false },
];

const organizationChartUsers: SeedUser[] = [
  {
    name: "Piengchan K.",
    email: "piengchan@example.com",
    position: "Managing Director / CFO",
    roleCode: "USER",
    organizationLevel: "EXECUTIVE",
    organizationTag: "EXECUTIVE",
    organizationAssignments: [
      { level: "EXECUTIVE", tag: "EXECUTIVE", isPrimary: true },
      { level: "MANAGER", tag: "BSD_MANAGER" },
    ],
    permissions: allViewerPermissions,
  },
  {
    name: "Bandit K.",
    email: "bandit@example.com",
    position: "CTO",
    roleCode: "USER",
    organizationLevel: "EXECUTIVE",
    organizationTag: "EXECUTIVE",
    permissions: allViewerPermissions,
  },
  {
    name: "Yothin L.",
    email: "yothin@example.com",
    position: "Consultant",
    roleCode: "USER",
    organizationLevel: "EXECUTIVE",
    organizationTag: "CONSULTANT",
    permissions: allViewerPermissions,
  },
  {
    name: "Theerajed Th.",
    email: "theerajed@example.com",
    position: "Service Manager",
    roleCode: "USER",
    organizationLevel: "MANAGER",
    organizationTag: "CS_MANAGER",
    permissions: allViewerPermissions,
  },
  {
    name: "Phuchid Ch.",
    email: "phuchid@example.com",
    position: "Solution Consult Asst.Manager",
    roleCode: "USER",
    organizationLevel: "MANAGER",
    organizationTag: "SC_MANAGER",
    permissions: allViewerPermissions,
  },
  {
    name: "Thawanat J.",
    email: "thawanat@example.com",
    position: "Customer Service Sr.System Engineer (Acting)",
    roleCode: "USER",
    organizationLevel: "MANAGER",
    organizationTag: "CS_MANAGER",
    organizationAssignments: [
      { level: "MANAGER", tag: "CS_MANAGER", isPrimary: true },
      { level: "SUPERVISOR", tag: "CMS_SUPERVISOR" },
    ],
    permissions: allViewerPermissions,
  },
  {
    name: "Suriya K.",
    email: "suriya@example.com",
    position: "Delivery & Client Asst.Manager",
    roleCode: "USER",
    organizationLevel: "MANAGER",
    organizationTag: "DL_MANAGER",
    permissions: allViewerPermissions,
  },
  {
    name: "Pongwut K.",
    email: "pongwut@example.com",
    position: "BSD Manager",
    roleCode: "USER",
    organizationLevel: "MANAGER",
    organizationTag: "BSD_MANAGER",
    permissions: allViewerPermissions,
  },
  {
    name: "Thanapol P.",
    email: "thanapol@example.com",
    position: "Sr.System Engineer",
    roleCode: "USER",
    organizationLevel: "SUPERVISOR",
    organizationTag: "S1_SUPERVISOR",
    permissions: allViewerPermissions,
  },
  {
    name: "Saran K.",
    email: "saran@example.com",
    position: "Network Engineer",
    roleCode: "USER",
    organizationLevel: "SUPERVISOR",
    organizationTag: "N1_SUPERVISOR",
    permissions: allViewerPermissions,
  },
  {
    name: "Tanawat W.",
    email: "tanawat@example.com",
    position: "System Engineer",
    roleCode: "USER",
    organizationLevel: "SUPERVISOR",
    organizationTag: "C1_SUPERVISOR",
    permissions: allViewerPermissions,
  },
  {
    name: "Chanvit L.",
    email: "chanvit@example.com",
    position: "Asst.Engineer (Acting Team Lead)",
    roleCode: "USER",
    organizationLevel: "SUPERVISOR",
    organizationTag: "CMS_SUPERVISOR",
    permissions: allViewerPermissions,
  },
  {
    name: "Chutithep P.",
    email: "chutithep@example.com",
    position: "Asst.Engineer",
    roleCode: "USER",
    organizationLevel: "SUPERVISOR",
    organizationTag: "SD_SUPERVISOR",
    permissions: allViewerPermissions,
  },
  {
    name: "Wirat Ch.",
    email: "wirat@example.com",
    position: "Sr.System Engineer",
    roleCode: "USER",
    organizationLevel: "SUPERVISOR",
    organizationTag: "PRT_SUPERVISOR",
    permissions: allViewerPermissions,
  },
  {
    name: "Tananut K.",
    email: "tananut@example.com",
    position: "Sr.Helpdesk",
    roleCode: "USER",
    organizationLevel: "SUPERVISOR",
    organizationTag: "LOCAL_SUPERVISOR",
    permissions: allViewerPermissions,
  },
  {
    name: "Sutthinan R.",
    email: "sutthinan@example.com",
    position: "Sr.Helpdesk",
    roleCode: "USER",
    organizationLevel: "STAFF",
    organizationTag: "DL_STAFF",
    permissions: allViewerPermissions,
  },
  {
    name: "Paveena Ch.",
    email: "paveena@example.com",
    position: "Sr.Accounting",
    roleCode: "USER",
    organizationLevel: "STAFF",
    organizationTag: "BSD_STAFF",
    permissions: allViewerPermissions,
  },
  {
    name: "Surarux S.",
    email: "surarux@example.com",
    position: "Sr.Administrator",
    roleCode: "USER",
    organizationLevel: "STAFF",
    organizationTag: "BSD_STAFF",
    permissions: allViewerPermissions,
  },
  {
    name: "Suchira R.",
    email: "suchira@example.com",
    position: "Staff",
    roleCode: "USER",
    organizationLevel: "STAFF",
    organizationTag: "BSD_STAFF",
    permissions: allViewerPermissions,
  },
  ...[
    ["Teeravet P.", "teeravet@example.com", "Asst.Engineer", "S1_STAFF"],
    ["Porramuch D.", "porramuch@example.com", "Asst.Engineer", "S1_STAFF"],
    ["Suebskul P.", "suebskul@example.com", "Asst.Engineer", "S1_STAFF"],
    ["Chotiwit R.", "chotiwit@example.com", "Sr.Helpdesk", "S1_STAFF"],
    ["Eakkapat J.", "eakkapat@example.com", "Sr.Helpdesk", "S1_STAFF"],
    ["Tossapol W.", "tossapol@example.com", "Sr.Helpdesk", "S1_STAFF"],
    ["Pongsatorn Sr.", "pongsatorn@example.com", "Sr.Helpdesk", "CMS_STAFF"],
    ["Thanid S.", "thanid@example.com", "Sr.Helpdesk", "CMS_STAFF"],
    ["Sarannupong S.", "sarannupong@example.com", "Asst.Engineer", "SD_STAFF"],
    ["Panuwat Ch.", "panuwat@example.com", "Sr.Helpdesk", "SD_STAFF"],
    ["Alongkorn S.", "alongkorn@example.com", "Sr.Helpdesk", "SD_STAFF"],
    ["Amorntep P.", "amorntep@example.com", "Sr.Helpdesk", "SD_STAFF"],
    ["Teerapong Ph.", "teerapong@example.com", "System Engineer", "PRT_STAFF"],
    ["Kitti Ph.", "kitti@example.com", "Helpdesk", "PRT_STAFF"],
    ["Siriluk Kh.", "siriluk@example.com", "Helpdesk", "PRT_STAFF"],
  ].map(([name, email, position, tag]) => ({
    name,
    email,
    position,
    roleCode: "USER" as RoleCode,
    organizationLevel: "STAFF" as OrganizationLevel,
    organizationTag: tag as OrganizationTag,
    permissions: allViewerPermissions,
  })),
  {
    name: "Sathit P.",
    email: "sathit@example.com",
    position: "Helpdesk",
    roleCode: "USER",
    organizationLevel: "STAFF",
    organizationTag: "SD_STAFF",
    organizationAssignments: [
      { level: "STAFF", tag: "SD_STAFF", isPrimary: true },
      { level: "STAFF", tag: "LOCAL_STAFF" },
    ],
    permissions: allViewerPermissions,
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
      description: "Can manage all warehouses, users, imports, and settings.",
    },
    {
      code: "STOCK_CONTROLLER",
      name: "Stock Controller",
      description: "Can manage assigned inventory warehouses and view other allowed warehouses.",
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

async function upsertWarehouses() {
  return Promise.all([
    prisma.assetWarehouse.upsert({
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
    prisma.assetWarehouse.upsert({
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
    prisma.assetWarehouse.upsert({
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
    prisma.assetWarehouse.upsert({
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
    prisma.assetWarehouse.upsert({
      where: { code: "SALE_STOCK" },
      update: {
        name: "Sale Stock",
        prefix: "SS",
        description: "Sale stock warehouse for BSD hardware.",
        inventoryFamily: AssetTrackMethod.QUANTITY,
      },
      create: {
        code: "SALE_STOCK",
        name: "Sale Stock",
        prefix: "SS",
        description: "Sale stock warehouse for BSD hardware.",
        inventoryFamily: AssetTrackMethod.QUANTITY,
      },
    }),
  ]);
}

const saleStockTaxonomy: Array<{ category: string; categoryCode: string; type: string; typeCode: string }> = [
  { category: "Power", categoryCode: "PW", type: "UPS", typeCode: "UPS" },
  { category: "Power", categoryCode: "PW", type: "Battery", typeCode: "BAT" },
  { category: "Storage", categoryCode: "ST", type: "HDD", typeCode: "HDD" },
  { category: "Storage", categoryCode: "ST", type: "SSD", typeCode: "SSD" },
  { category: "Storage", categoryCode: "ST", type: "USB Flash Drive", typeCode: "UFD" },
  { category: "Storage", categoryCode: "ST", type: "Memory Card", typeCode: "MCD" },
  { category: "Memory", categoryCode: "MM", type: "RAM", typeCode: "RAM" },
  { category: "Computer", categoryCode: "CP", type: "Notebook", typeCode: "NBK" },
  { category: "Computer", categoryCode: "CP", type: "Mini PC", typeCode: "MPC" },
  { category: "Computer", categoryCode: "CP", type: "PC/Desktop", typeCode: "PCD" },
  { category: "Computer", categoryCode: "CP", type: "Monitor", typeCode: "MON" },
  { category: "Computer", categoryCode: "CP", type: "Component", typeCode: "CPN" },
  { category: "Cables", categoryCode: "CB", type: "HDMI", typeCode: "HDM" },
  { category: "Cables", categoryCode: "CB", type: "USB Cable", typeCode: "USB" },
  { category: "Cables", categoryCode: "CB", type: "VGA Cable", typeCode: "VGA" },
  { category: "Cables", categoryCode: "CB", type: "Printer Cable", typeCode: "PRT" },
  { category: "Adapter & Converter", categoryCode: "AD", type: "Converter", typeCode: "ADP" },
  { category: "Accessories", categoryCode: "AC", type: "Mouse pad", typeCode: "MPD" },
  { category: "Accessories", categoryCode: "AC", type: "Bag", typeCode: "BAG" },
  { category: "Accessories", categoryCode: "AC", type: "Mouse", typeCode: "MOU" },
  { category: "Accessories", categoryCode: "AC", type: "Headphones", typeCode: "HPN" },
  { category: "Accessories", categoryCode: "AC", type: "Keypad", typeCode: "KPD" },
  { category: "Accessories", categoryCode: "AC", type: "Enclosure", typeCode: "ENC" },
  { category: "Accessories", categoryCode: "AC", type: "Office Accessory", typeCode: "OFA" },
  { category: "Accessories", categoryCode: "AC", type: "Switch", typeCode: "SWT" },
];

async function upsertSaleStockTaxonomy(warehouseId: string) {
  const categories = new Map<string, string>();

  for (const item of saleStockTaxonomy) {
    let categoryId = categories.get(item.category);

    if (!categoryId) {
      const category = await prisma.assetCategory.upsert({
        where: { warehouseId_name: { warehouseId, name: item.category } },
        update: { code: item.categoryCode, isActive: true },
        create: { code: item.categoryCode, warehouseId, isActive: true, name: item.category },
      });
      categoryId = category.id;
      categories.set(item.category, categoryId);
    }

    await prisma.assetType.upsert({
      where: { categoryId_name: { categoryId, name: item.type } },
      update: { code: item.typeCode, isActive: true, trackMethod: AssetTrackMethod.QUANTITY },
      create: {
        categoryId,
        code: item.typeCode,
        isActive: true,
        name: item.type,
        trackMethod: AssetTrackMethod.QUANTITY,
      },
    });
  }
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

async function upsertBsdTaxonomy(warehouseId: string) {
  const categories = new Map<string, string>();

  for (const item of bsdTaxonomy) {
    let categoryId = categories.get(item.category);

    if (!categoryId) {
      const category = await prisma.assetCategory.upsert({
        where: { warehouseId_name: { warehouseId, name: item.category } },
        update: { isActive: true },
        create: { warehouseId, isActive: true, name: item.category },
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

async function upsertDlTaxonomy(warehouseId: string) {
  const categories = new Map<string, string>();

  for (const item of dlTaxonomy) {
    let categoryId = categories.get(item.category);

    if (!categoryId) {
      const category = await prisma.assetCategory.upsert({
        where: { warehouseId_name: { warehouseId, name: item.category } },
        update: { isActive: true },
        create: { warehouseId, isActive: true, name: item.category },
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
  warehouseByCode: Map<string, string>,
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

  const assignments =
    user.organizationAssignments ??
    (user.organizationLevel && user.organizationTag
      ? [
          {
            isPrimary: true,
            level: user.organizationLevel,
            tag: user.organizationTag,
          },
        ]
      : []);

  if (assignments.length > 0) {
    const primaryAssignment = assignments.find((assignment) => assignment.isPrimary) ?? assignments[0];

    await prisma.userOrganizationAssignment.updateMany({
      data: { isPrimary: false },
      where: { userId: createdUser.id },
    });

    for (const assignment of assignments) {
      const isPrimary = assignment.tag === primaryAssignment.tag;

      await prisma.userOrganizationAssignment.upsert({
        where: {
          userId_organizationTag: {
            userId: createdUser.id,
            organizationTag: assignment.tag,
          },
        },
        update: {
          isActive: true,
          isPrimary,
          organizationLevel: assignment.level,
        },
        create: {
          isActive: true,
          isPrimary,
          organizationLevel: assignment.level,
          organizationTag: assignment.tag,
          userId: createdUser.id,
        },
      });
    }
  }

  for (const permission of user.permissions) {
    const warehouseId = warehouseByCode.get(permission.warehouseCode);
    if (!warehouseId) {
      throw new Error(`Missing warehouse ${permission.warehouseCode}`);
    }

    await prisma.userWarehousePermission.upsert({
      where: {
        userId_warehouseId: {
          userId: createdUser.id,
          warehouseId,
        },
      },
      update: {
        canView: permission.canView,
        canManage: permission.canManage,
      },
      create: {
        userId: createdUser.id,
        warehouseId,
        canView: permission.canView,
        canManage: permission.canManage,
      },
    });
  }

  return createdUser;
}

async function main() {
  const [roles, warehouses] = await Promise.all([upsertRoles(), upsertWarehouses()]);
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const roleByCode = new Map(roles.map((role) => [role.code, role.id]));
  const warehouseByCode = new Map(
    warehouses.map((warehouse) => [warehouse.code, warehouse.id]),
  );
  const bsdWarehouseId = warehouseByCode.get("BSD");
  const dlWarehouseId = warehouseByCode.get("DL");
  const saleStockWarehouseId = warehouseByCode.get("SALE_STOCK");

  if (!bsdWarehouseId) {
    throw new Error("Missing warehouse BSD");
  }
  if (!dlWarehouseId) {
    throw new Error("Missing warehouse DL");
  }
  if (!saleStockWarehouseId) {
    throw new Error("Missing warehouse SALE_STOCK");
  }

  await upsertBsdTaxonomy(bsdWarehouseId);
  await upsertDlTaxonomy(dlWarehouseId);
  await upsertSaleStockTaxonomy(saleStockWarehouseId);

  for (const user of [...seedUsers, ...organizationChartUsers]) {
    await upsertSeedUser(user, passwordHash, roleByCode, warehouseByCode);
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
