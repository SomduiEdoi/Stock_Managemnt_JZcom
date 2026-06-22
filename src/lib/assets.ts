import { AssetStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageDomainForUser,
  canViewDomainForUser,
  domainCodes,
  type DomainCode,
  type PermissionUser,
} from "@/lib/permissions";

export const assetDomainOptions = domainCodes;
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

export type AssetDomainFilter = DomainCode | "ALL";
export type AssetStatusFilter = (typeof problemAssetStatusOptions)[number] | "ALL";
export type AssetDomainAccess = "MANAGE" | "READ_ONLY" | "NONE";

export type AssetListFilters = {
  category: string;
  domain: AssetDomainFilter;
  page: number;
  pageSize: number;
  search: string;
  status: AssetStatusFilter;
  type: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: AssetListFilters = {
  category: "ALL",
  domain: "ALL",
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
  domain: { select: { code: true, name: true } },
  location: { select: { name: true } },
});

type AssetListRecord = Prisma.AssetGetPayload<{
  select: typeof assetListSelect;
}>;

export type AssetListRow = AssetListRecord & {
  domainAccess: AssetDomainAccess;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDomainCode(value: string | undefined): value is DomainCode {
  return assetDomainOptions.includes(value as DomainCode);
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
  const domain = firstParam(searchParams.domain);
  const status = firstParam(searchParams.status);

  return {
    category: cleanFilterValue(firstParam(searchParams.category)),
    domain: isDomainCode(domain) ? domain : defaultFilters.domain,
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    status: isAssetStatus(status) ? status : defaultFilters.status,
    type: cleanFilterValue(firstParam(searchParams.type)),
  };
}

export function getVisibleDomainCodes(user: PermissionUser) {
  return assetDomainOptions.filter((domainCode) =>
    canViewDomainForUser(user, domainCode),
  );
}

export function getDomainAccess(
  user: PermissionUser,
  domainCode: DomainCode,
): AssetDomainAccess {
  if (canManageDomainForUser(user, domainCode)) {
    return "MANAGE";
  }

  return canViewDomainForUser(user, domainCode) ? "READ_ONLY" : "NONE";
}

export function getSelectedDomainCodes(
  user: PermissionUser,
  domainFilter: AssetDomainFilter,
) {
  const visibleDomainCodes = getVisibleDomainCodes(user);

  if (domainFilter === "ALL") {
    return visibleDomainCodes;
  }

  return visibleDomainCodes.includes(domainFilter) ? [domainFilter] : [];
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
  user: PermissionUser,
  filters: AssetListFilters,
): Prisma.AssetWhereInput {
  const clauses: Prisma.AssetWhereInput[] = [];
  const searchWhere = buildSearchWhere(filters.search);

  if (searchWhere) {
    clauses.push(searchWhere);
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
    domain: { code: { in: getSelectedDomainCodes(user, filters.domain) } },
    ...(filters.status === "ALL"
      ? { status: { in: [...problemAssetStatusOptions] } }
      : { status: filters.status }),
    ...(clauses.length > 0 ? { AND: clauses } : {}),
  };
}

function withDomainAccess(
  user: CurrentUser,
  asset: AssetListRecord,
): AssetListRow {
  return {
    ...asset,
    domainAccess: getDomainAccess(user, asset.domain.code),
  };
}

export async function listAssetsForUser(
  user: CurrentUser,
  filters: AssetListFilters,
) {
  const where = buildAssetWhere(user, filters);
  const skip = (filters.page - 1) * filters.pageSize;
  const filterDomainCodes = getSelectedDomainCodes(user, filters.domain);
  const filterOptionDomainCodes =
    filterDomainCodes.length > 0 ? filterDomainCodes : getVisibleDomainCodes(user);
  const [assets, total, categories, types] = await db.$transaction([
    db.asset.findMany({
      orderBy: [{ updatedAt: "desc" }, { serialNo: "asc" }],
      select: assetListSelect,
      skip,
      take: filters.pageSize,
      where,
    }),
    db.asset.count({ where }),
    db.assetCategory.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
      where: {
        domain: { code: { in: filterOptionDomainCodes } },
        isActive: true,
      },
    }),
    db.assetModel.findMany({
      distinct: ["typeName"],
      orderBy: { typeName: "asc" },
      select: { typeName: true },
      where: {
        domain: { code: { in: filterOptionDomainCodes } },
        isActive: true,
        typeName: { not: null },
      },
    }),
  ]);

  return {
    assets: assets.map((asset) => withDomainAccess(user, asset)),
    filterOptions: {
      categories: categories.map((category) => category.name),
      types: types.map((type) => type.typeName).filter(Boolean) as string[],
    },
    filters,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    visibleDomainCodes: getVisibleDomainCodes(user),
  };
}

export async function getAssetOverviewForUser(user: CurrentUser) {
  const visibleDomainCodes = getVisibleDomainCodes(user);
  const where: Prisma.AssetWhereInput = {
    isActive: true,
    domain: { code: { in: visibleDomainCodes } },
  };
  const [total, byStatus, byDomain] = await Promise.all([
    db.asset.count({ where }),
    Promise.all(
      assetStatusOptions.map(async (status) => ({
        status,
        total: await db.asset.count({ where: { ...where, status } }),
      })),
    ),
    Promise.all(
      visibleDomainCodes.map(async (domainCode) => ({
        domainCode,
        total: await db.asset.count({
          where: { isActive: true, domain: { code: domainCode } },
        }),
      })),
    ),
  ]);

  return {
    byDomain,
    byStatus,
    total,
  };
}
