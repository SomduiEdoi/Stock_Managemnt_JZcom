import { AssetStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageWarehouseForUser,
  canViewWarehouseForUser,
  warehouseCodes,
  type WarehouseCode,
  type PermissionUser,
} from "@/lib/permissions";

export const assetWarehouseOptions: string[] = [...warehouseCodes];
export const assetStatusOptions = [
  "READY",
  "REQUEST",
  "BORROW",
  "USING",
  "SOLD",
  "FAIL",
  "LOST",
  "NEED_CHECK",
] as const satisfies readonly AssetStatus[];

export const problemAssetStatusOptions = [
  AssetStatus.FAIL,
  AssetStatus.LOST,
  AssetStatus.NEED_CHECK,
] as const satisfies readonly AssetStatus[];

export type AssetWarehouseFilter = WarehouseCode | "ALL";
export type AssetStatusFilter = (typeof problemAssetStatusOptions)[number] | "ALL";
export type AssetWarehouseAccess = "MANAGE" | "READ_ONLY" | "NONE";

export type AssetListFilters = {
  brand: string;
  category: string;
  warehouse: AssetWarehouseFilter;
  page: number;
  pageSize: number;
  search: string;
  status: AssetStatusFilter;
  type: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: AssetListFilters = {
  brand: "ALL",
  category: "ALL",
  warehouse: "ALL",
  page: 1,
  pageSize: 25,
  search: "",
  status: "ALL",
  type: "ALL",
};

const assetListSelect = Prisma.validator<Prisma.AssetSelect>()({
  id: true,
  locationText: true,
  note: true,
  serialNo: true,
  status: true,
  stockCode: true,
  updatedAt: true,
  assetModel: {
    select: {
      brand: true,
      category: { select: { name: true } },
      name: true,
      partNo: true,
      typeName: true,
    },
  },
  warehouse: { select: { code: true, name: true } },
  location: { select: { name: true } },
});

type AssetListRecord = Prisma.AssetGetPayload<{
  select: typeof assetListSelect;
}>;

export type AssetListRow = AssetListRecord & {
  warehouseAccess: AssetWarehouseAccess;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isWarehouseCode(value: string | undefined): value is WarehouseCode {
  return Boolean(value && value !== "ALL");
}

function isAssetStatus(
  value: string | undefined,
): value is (typeof problemAssetStatusOptions)[number] {
  return problemAssetStatusOptions.includes(
    value as (typeof problemAssetStatusOptions)[number],
  );
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : defaultFilters.page;
}

function cleanFilterValue(value: string | undefined) {
  const nextValue = value?.trim();

  return nextValue ? nextValue : "ALL";
}

export function normalizeAssetListFilters(
  searchParams: SearchParams,
): AssetListFilters {
  const warehouse = firstParam(searchParams.warehouse);
  const status = firstParam(searchParams.status);

  return {
    brand: cleanFilterValue(firstParam(searchParams.brand)),
    category: cleanFilterValue(firstParam(searchParams.category)),
    warehouse: isWarehouseCode(warehouse) ? warehouse : defaultFilters.warehouse,
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    status: isAssetStatus(status) ? status : defaultFilters.status,
    type: cleanFilterValue(firstParam(searchParams.type)),
  };
}

export function getVisibleWarehouseCodes(user: PermissionUser) {
  if (user.roles.includes("ADMIN")) {
    return assetWarehouseOptions;
  }

  return user.permissions
    .filter((permission) => permission.canView || permission.canManage)
    .map((permission) => permission.warehouseCode);
}

async function getActiveWarehouseCodes() {
  const warehouses = await db.assetWarehouse.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true },
    where: { isActive: true },
  });

  return warehouses;
}

export async function getVisibleWarehouseOptionsForUser(user: PermissionUser) {
  const activeWarehouses = await getActiveWarehouseCodes();

  if (user.roles.includes("ADMIN")) {
    return activeWarehouses;
  }

  const permittedCodes = new Set(
    user.permissions
      .filter((permission) => permission.canView || permission.canManage)
      .map((permission) => permission.warehouseCode),
  );

  return activeWarehouses.filter((warehouse) => permittedCodes.has(warehouse.code));
}

export async function getVisibleWarehouseCodesForUser(user: PermissionUser) {
  const warehouses = await getVisibleWarehouseOptionsForUser(user);

  return warehouses.map((warehouse) => warehouse.code);
}

export function getWarehouseAccess(
  user: PermissionUser,
  warehouseCode: WarehouseCode,
): AssetWarehouseAccess {
  if (canManageWarehouseForUser(user, warehouseCode)) {
    return "MANAGE";
  }

  return canViewWarehouseForUser(user, warehouseCode) ? "READ_ONLY" : "NONE";
}

export function getSelectedWarehouseCodes(
  user: PermissionUser,
  warehouseFilter: AssetWarehouseFilter,
) {
  const visibleWarehouseCodes = getVisibleWarehouseCodes(user);

  if (warehouseFilter === "ALL") {
    return visibleWarehouseCodes;
  }

  return visibleWarehouseCodes.includes(warehouseFilter) ? [warehouseFilter] : [];
}

export function getSelectedWarehouseCodesFromVisible(
  visibleWarehouseCodes: string[],
  warehouseFilter: AssetWarehouseFilter,
) {
  if (warehouseFilter === "ALL") {
    return visibleWarehouseCodes;
  }

  return visibleWarehouseCodes.includes(warehouseFilter) ? [warehouseFilter] : [];
}

function containsText(search: string) {
  return {
    contains: search,
    mode: Prisma.QueryMode.insensitive,
  };
}

function buildSearchWhere(search: string): Prisma.AssetWhereInput | undefined {
  if (!search) {
    return undefined;
  }

  const contains = containsText(search);

  return {
    OR: [
      { serialNo: contains },
      { stockCode: contains },
      { locationText: contains },
      { note: contains },
      { assetModel: { is: { brand: contains } } },
      { assetModel: { is: { name: contains } } },
      { assetModel: { is: { partNo: contains } } },
      { assetModel: { is: { typeName: contains } } },
      { assetModel: { is: { category: { is: { name: contains } } } } },
      { location: { is: { name: contains } } },
    ],
  };
}

export function buildAssetWhere(
  filters: AssetListFilters,
  selectedWarehouseCodes: string[],
): Prisma.AssetWhereInput {
  const clauses: Prisma.AssetWhereInput[] = [];
  const searchWhere = buildSearchWhere(filters.search);

  if (searchWhere) {
    clauses.push(searchWhere);
  }

  if (filters.brand !== "ALL") {
    clauses.push({ assetModel: { is: { brand: filters.brand } } });
  }

  if (filters.category !== "ALL") {
    clauses.push({
      assetModel: { is: { category: { is: { name: filters.category } } } },
    });
  }

  if (filters.type !== "ALL") {
    clauses.push({ assetModel: { is: { typeName: filters.type } } });
  }

  return {
    isActive: true,
    warehouse: { code: { in: selectedWarehouseCodes } },
    ...(filters.status === "ALL"
      ? { status: { in: [...problemAssetStatusOptions] } }
      : { status: filters.status }),
    ...(clauses.length > 0 ? { AND: clauses } : {}),
  };
}

function withWarehouseAccess(
  user: CurrentUser,
  asset: AssetListRecord,
): AssetListRow {
  return {
    ...asset,
    warehouseAccess: getWarehouseAccess(user, asset.warehouse.code),
  };
}

export async function listAssetsForUser(
  user: CurrentUser,
  filters: AssetListFilters,
) {
  const visibleWarehouseOptions = await getVisibleWarehouseOptionsForUser(user);
  const visibleWarehouseCodes = visibleWarehouseOptions.map((warehouse) => warehouse.code);
  const filterWarehouseCodes = getSelectedWarehouseCodesFromVisible(
    visibleWarehouseCodes,
    filters.warehouse,
  );
  const where = buildAssetWhere(filters, filterWarehouseCodes);
  const skip = (filters.page - 1) * filters.pageSize;
  const filterOptionWarehouseCodes =
    filterWarehouseCodes.length > 0 ? filterWarehouseCodes : visibleWarehouseCodes;
  const [assets, total, brands, categories, types] = await db.$transaction([
    db.asset.findMany({
      orderBy: [{ updatedAt: "desc" }, { serialNo: "asc" }],
      select: assetListSelect,
      skip,
      take: filters.pageSize,
      where,
    }),
    db.asset.count({ where }),
    db.assetModel.findMany({
      distinct: ["brand"],
      orderBy: { brand: "asc" },
      select: { brand: true },
      where: {
        brand: { not: null },
        warehouse: { code: { in: filterOptionWarehouseCodes } },
        isActive: true,
      },
    }),
    db.assetCategory.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
      where: {
        warehouse: { code: { in: filterOptionWarehouseCodes } },
        isActive: true,
      },
    }),
    db.assetModel.findMany({
      distinct: ["typeName"],
      orderBy: { typeName: "asc" },
      select: { typeName: true },
      where: {
        warehouse: { code: { in: filterOptionWarehouseCodes } },
        isActive: true,
        typeName: { not: null },
      },
    }),
  ]);

  return {
    assets: assets.map((asset) => withWarehouseAccess(user, asset)),
    filterOptions: {
      brands: brands.map((brand) => brand.brand).filter(Boolean) as string[],
      categories: categories.map((category) => category.name),
      types: types.map((type) => type.typeName).filter(Boolean) as string[],
    },
    filters,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    warehouseOptions: visibleWarehouseOptions,
    visibleWarehouseCodes,
  };
}

export async function getAssetOverviewForUser(user: CurrentUser) {
  const visibleWarehouseCodes = await getVisibleWarehouseCodesForUser(user);
  const where: Prisma.AssetWhereInput = {
    isActive: true,
    warehouse: { code: { in: visibleWarehouseCodes } },
  };
  const [total, byStatus, byWarehouse] = await Promise.all([
    db.asset.count({ where }),
    Promise.all(
      assetStatusOptions.map(async (status) => ({
        status,
        total: await db.asset.count({ where: { ...where, status } }),
      })),
    ),
    Promise.all(
      visibleWarehouseCodes.map(async (warehouseCode) => ({
        warehouseCode,
        total: await db.asset.count({
          where: { isActive: true, warehouse: { code: warehouseCode } },
        }),
      })),
    ),
  ]);

  return {
    byWarehouse,
    byStatus,
    total,
  };
}


