import { Prisma, type AssetStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageDomainForUser,
  canViewDomainForUser,
  type DomainCode,
  type PermissionUser,
} from "@/lib/permissions";

export const assetDomainOptions = ["SERVER", "NETWORK"] as const;
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

export type AssetDomainFilter = DomainCode | "ALL";
export type AssetStatusFilter = AssetStatus | "ALL";
export type AssetDomainAccess = "MANAGE" | "READ_ONLY" | "NONE";

export type AssetListFilters = {
  domain: AssetDomainFilter;
  page: number;
  pageSize: number;
  search: string;
  status: AssetStatusFilter;
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: AssetListFilters = {
  domain: "ALL",
  page: 1,
  pageSize: 25,
  search: "",
  status: "ALL",
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

function isAssetStatus(value: string | undefined): value is AssetStatus {
  return assetStatusOptions.includes(value as AssetStatus);
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : defaultFilters.page;
}

export function normalizeAssetListFilters(
  searchParams: SearchParams,
): AssetListFilters {
  const domain = firstParam(searchParams.domain);
  const status = firstParam(searchParams.status);

  return {
    domain: isDomainCode(domain) ? domain : defaultFilters.domain,
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    status: isAssetStatus(status) ? status : defaultFilters.status,
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
  return {
    isActive: true,
    domain: { code: { in: getSelectedDomainCodes(user, filters.domain) } },
    ...(filters.status === "ALL" ? {} : { status: filters.status }),
    ...buildSearchWhere(filters.search),
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
  const [assets, total] = await db.$transaction([
    db.asset.findMany({
      orderBy: [{ updatedAt: "desc" }, { serialNo: "asc" }],
      select: assetListSelect,
      skip,
      take: filters.pageSize,
      where,
    }),
    db.asset.count({ where }),
  ]);

  return {
    assets: assets.map((asset) => withDomainAccess(user, asset)),
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
