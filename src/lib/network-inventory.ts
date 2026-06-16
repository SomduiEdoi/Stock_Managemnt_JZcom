import { AssetStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewDomainForUser } from "@/lib/permissions";

export const networkInventoryStatusOptions = [
  AssetStatus.READY,
  AssetStatus.REQUEST,
  AssetStatus.BORROW,
  AssetStatus.USING,
  AssetStatus.SOLD,
  AssetStatus.FAIL,
  AssetStatus.LOST,
  AssetStatus.NEED_CHECK,
] as const satisfies readonly AssetStatus[];

export type NetworkInventoryFilters = {
  categories: string[];
  page: number;
  pageSize: number;
  search: string;
  statuses: AssetStatus[];
  types: string[];
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: NetworkInventoryFilters = {
  categories: [],
  page: 1,
  pageSize: 25,
  search: "",
  statuses: [],
  types: [],
};

const networkAssetSelect = Prisma.validator<Prisma.AssetSelect>()({
  id: true,
  locationText: true,
  serialNo: true,
  status: true,
  stockCode: true,
  updatedAt: true,
  assetModel: {
    select: {
      brand: true,
      category: { select: { name: true } },
      name: true,
      typeName: true,
    },
  },
  location: { select: { name: true } },
});

export type NetworkInventoryRow = Prisma.AssetGetPayload<{
  select: typeof networkAssetSelect;
}>;

function arrayParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function cleanValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isAssetStatus(value: string): value is AssetStatus {
  return networkInventoryStatusOptions.includes(value as AssetStatus);
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : defaultFilters.page;
}

function containsText(search: string) {
  return {
    contains: search,
    mode: Prisma.QueryMode.insensitive,
  };
}

function buildKeywordClause(token: string): Prisma.AssetWhereInput {
  const contains = containsText(token);

  return {
    OR: [
      { assetNo: contains },
      { locationText: contains },
      { note: contains },
      { serialNo: contains },
      { stockCode: contains },
      { assetModel: { is: { brand: contains } } },
      { assetModel: { is: { modelNo: contains } } },
      { assetModel: { is: { name: contains } } },
      { assetModel: { is: { partNo: contains } } },
      { assetModel: { is: { typeName: contains } } },
      { assetModel: { is: { category: { is: { name: contains } } } } },
      { location: { is: { name: contains } } },
    ],
  };
}

function buildSearchWhere(search: string): Prisma.AssetWhereInput | undefined {
  const tokens = search.split(/\s+/).map((token) => token.trim()).filter(Boolean);

  if (tokens.length === 0) {
    return undefined;
  }

  return { AND: tokens.slice(0, 8).map(buildKeywordClause) };
}

function buildFilterClauses(filters: NetworkInventoryFilters) {
  const clauses: Prisma.AssetWhereInput[] = [];
  const searchWhere = buildSearchWhere(filters.search);

  if (searchWhere) {
    clauses.push(searchWhere);
  }

  if (filters.categories.length > 0) {
    clauses.push({
      assetModel: {
        is: { category: { is: { name: { in: filters.categories } } } },
      },
    });
  }

  if (filters.types.length > 0) {
    clauses.push({ assetModel: { is: { typeName: { in: filters.types } } } });
  }

  return clauses;
}

export function normalizeNetworkInventoryFilters(
  searchParams: SearchParams,
): NetworkInventoryFilters {
  const statuses = cleanValues(arrayParam(searchParams.status)).filter(isAssetStatus);

  return {
    categories: cleanValues(arrayParam(searchParams.category)),
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    statuses,
    types: cleanValues(arrayParam(searchParams.type)),
  };
}

export function buildNetworkInventoryWhere(filters: NetworkInventoryFilters) {
  const clauses = buildFilterClauses(filters);

  return {
    isActive: true,
    domain: { code: "NETWORK" },
    ...(filters.statuses.length > 0 ? { status: { in: filters.statuses } } : {}),
    ...(clauses.length > 0 ? { AND: clauses } : {}),
  } satisfies Prisma.AssetWhereInput;
}

async function getNetworkFilterOptions() {
  const [categories, types] = await Promise.all([
    db.assetCategory.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
      where: { domain: { code: "NETWORK" }, isActive: true },
    }),
    db.assetModel.findMany({
      distinct: ["typeName"],
      orderBy: { typeName: "asc" },
      select: { typeName: true },
      where: {
        domain: { code: "NETWORK" },
        isActive: true,
        typeName: { not: null },
      },
    }),
  ]);

  return {
    categories: categories.map((category) => category.name),
    statuses: [...networkInventoryStatusOptions],
    types: types.map((type) => type.typeName).filter(Boolean) as string[],
  };
}

async function getNetworkMetrics(baseWhere: Prisma.AssetWhereInput) {
  const [total, ready, borrowed, sold, request] = await Promise.all([
    db.asset.count({ where: baseWhere }),
    db.asset.count({ where: { ...baseWhere, status: AssetStatus.READY } }),
    db.asset.count({ where: { ...baseWhere, status: AssetStatus.BORROW } }),
    db.asset.count({ where: { ...baseWhere, status: AssetStatus.SOLD } }),
    db.asset.count({ where: { ...baseWhere, status: AssetStatus.REQUEST } }),
  ]);

  return { borrowed, ready, request, sold, total };
}

export async function getNetworkInventoryForUser(
  user: CurrentUser,
  filters: NetworkInventoryFilters,
) {
  const canView = canViewDomainForUser(user, "NETWORK");
  const baseWhere = {
    isActive: true,
    domain: { code: "NETWORK" },
  } satisfies Prisma.AssetWhereInput;

  if (!canView) {
    return {
      canView,
      filterOptions: await getNetworkFilterOptions(),
      filters,
      metrics: { borrowed: 0, ready: 0, request: 0, sold: 0, total: 0 },
      rows: [],
      total: 0,
      totalPages: 1,
    };
  }

  const where = buildNetworkInventoryWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;
  const [filterOptions, metrics, rows, total] = await Promise.all([
    getNetworkFilterOptions(),
    getNetworkMetrics(baseWhere),
    db.asset.findMany({
      orderBy: [{ updatedAt: "desc" }, { serialNo: "asc" }],
      select: networkAssetSelect,
      skip,
      take: filters.pageSize,
      where,
    }),
    db.asset.count({ where }),
  ]);

  return {
    canView,
    filterOptions,
    filters,
    metrics,
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}
