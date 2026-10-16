import { AssetStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { getAvailabilityByAssetId } from "@/lib/asset-availability";
import { db } from "@/lib/db";
import { canViewWarehouseForUser } from "@/lib/permissions";

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

export type InventorySortBy = "availability" | "brand" | "category" | "model" | "serialNo" | "status" | "stockCode" | "type";
export type InventorySortDirection = "asc" | "desc";

export type InventoryCategoryCustomField = {
  dataType: "TEXT" | "NUMBER" | "DROPDOWN" | "BOOLEAN";
  id: string;
  isFilterable: boolean;
  isRequired: boolean;
  isSearchable: boolean;
  key: string;
  label: string;
  options: string[];
  placeholder: string | null;
  sortOrder: number;
  unit: string | null;
};

export type NetworkCategoryGroup = {
  assetCount: number;
  code: string | null;
  id: string;
  name: string;
  customFields: InventoryCategoryCustomField[];
  types: Array<{ assetCount: number; code: string | null; id: string; name: string }>;
};

export type NetworkInventoryFilters = {
  brands: string[];
  categories: string[];
  page: number;
  pageSize: number;
  search: string;
  sortBy: InventorySortBy;
  sortDirection: InventorySortDirection;
  statuses: AssetStatus[];
  types: string[];
  favoriteOnly?: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

const defaultFilters: NetworkInventoryFilters = {
  brands: [],
  categories: [],
  page: 1,
  pageSize: 25,
  search: "",
  sortBy: "model",
  sortDirection: "asc",
  statuses: [],
  types: [],
};

const networkAssetSelect = Prisma.validator<Prisma.AssetSelect>()({
  assetQuantity: true,
  id: true,
  locationText: true,
  requestLockedById: true,
  isRecommended: true,
  recommendedAt: true,
  serialNo: true,
  status: true,
  stockCode: true,
  updatedAt: true,
  assetModel: {
    select: {
      isSerialized: true,
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
}> & {
  availableQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
};

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

function parseSortBy(value: string | undefined): InventorySortBy {
  const allowed = ["availability", "brand", "category", "model", "serialNo", "status", "stockCode", "type"] as const;

  return allowed.includes(value as InventorySortBy) ? (value as InventorySortBy) : defaultFilters.sortBy;
}

function parseSortDirection(value: string | undefined): InventorySortDirection {
  return value === "desc" ? "desc" : defaultFilters.sortDirection;
}

function buildInventoryOrderBy(filters: NetworkInventoryFilters): Prisma.AssetOrderByWithRelationInput[] {
  const direction = filters.sortDirection;

  switch (filters.sortBy) {
    case "availability":
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { assetQuantity: direction }, { updatedAt: "desc" }];
    case "brand":
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { assetModel: { brand: direction } }, { updatedAt: "desc" }];
    case "category":
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { assetModel: { category: { name: direction } } }, { updatedAt: "desc" }];
    case "serialNo":
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { serialNo: direction }, { updatedAt: "desc" }];
    case "status":
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { status: direction }, { updatedAt: "desc" }];
    case "stockCode":
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { stockCode: direction }, { updatedAt: "desc" }];
    case "type":
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { assetModel: { typeName: direction } }, { updatedAt: "desc" }];
    case "model":
    default:
      return [{ isRecommended: "desc" }, { recommendedAt: "asc" }, { assetModel: { name: direction } }, { updatedAt: "desc" }];
  }
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
      { customFieldValues: { some: { field: { isSearchable: true }, valueText: contains } } },
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

  if (filters.brands.length > 0) {
    clauses.push({ assetModel: { is: { brand: { in: filters.brands } } } });
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
    brands: cleanValues(arrayParam(searchParams.brand)),
    categories: cleanValues(arrayParam(searchParams.category)),
    page: parsePage(firstParam(searchParams.page)),
    pageSize: defaultFilters.pageSize,
    search: firstParam(searchParams.q)?.trim() ?? defaultFilters.search,
    sortBy: parseSortBy(firstParam(searchParams.sort)),
    sortDirection: parseSortDirection(firstParam(searchParams.dir)),
    statuses,
    types: cleanValues(arrayParam(searchParams.type)),
    favoriteOnly: firstParam(searchParams.favorite) === "1",
  };
}

export function buildNetworkInventoryWhere(filters: NetworkInventoryFilters, userId?: string) {
  const clauses = buildFilterClauses(filters);

  return {
    isActive: true,
    warehouse: { code: "NETWORK" },
    ...(filters.statuses.length > 0 ? { status: { in: filters.statuses } } : {}),
    ...(clauses.length > 0 ? { AND: clauses } : {}),
    ...(filters.favoriteOnly && userId ? { favorites: { some: { userId } } } : {}),
  } satisfies Prisma.AssetWhereInput;
}

async function getNetworkFilterOptions() {
  const categories = await db.assetCategory.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      customFields: {
        orderBy: { sortOrder: "asc" },
        select: {
          dataType: true,
          id: true,
          isFilterable: true,
          isRequired: true,
          isSearchable: true,
          key: true,
          label: true,
          options: true,
          placeholder: true,
          sortOrder: true,
          unit: true,
        },
        where: { isActive: true },
      },
      types: {
        orderBy: { name: "asc" },
        select: {
          code: true,
          id: true,
          name: true,
        },
        where: { isActive: true },
      },
    },
    where: { warehouse: { code: "NETWORK" }, isActive: true },
  });
  const assetCounts = await db.asset.groupBy({
    by: ["assetModelId"],
    _count: true,
    where: { warehouse: { code: "NETWORK" }, isActive: true },
  });
  const models = await db.assetModel.findMany({
    select: { assetTypeId: true, brand: true, categoryId: true, id: true },
    where: { warehouse: { code: "NETWORK" }, isActive: true },
  });
  const countByModel = new Map(assetCounts.map((count) => [count.assetModelId, count._count]));
  const categoryAssetCounts = new Map<string, number>();
  const typeAssetCounts = new Map<string, number>();

  models.forEach((model) => {
    const count = countByModel.get(model.id) ?? 0;

    if (model.categoryId) {
      categoryAssetCounts.set(model.categoryId, (categoryAssetCounts.get(model.categoryId) ?? 0) + count);
    }

    if (model.assetTypeId) {
      typeAssetCounts.set(model.assetTypeId, (typeAssetCounts.get(model.assetTypeId) ?? 0) + count);
    }
  });
  const categoryGroups: NetworkCategoryGroup[] = categories.map((category) => ({
    assetCount: categoryAssetCounts.get(category.id) ?? 0,
    code: category.code,
    id: category.id,
    name: category.name,
    customFields: category.customFields.map((field) => ({
      dataType: field.dataType,
      id: field.id,
      isFilterable: field.isFilterable,
      isRequired: field.isRequired,
      isSearchable: field.isSearchable,
      key: field.key,
      label: field.label,
      options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string") : [],
      placeholder: field.placeholder,
      sortOrder: field.sortOrder,
      unit: field.unit,
    })),
    types: category.types.map((type) => ({
      assetCount: typeAssetCounts.get(type.id) ?? 0,
      code: type.code,
      id: type.id,
      name: type.name,
    })),
  }));

  return {
    brands: [...new Set(models.map((model) => model.brand).filter((brand): brand is string => Boolean(brand)))].sort((left, right) => left.localeCompare(right)),
    categories: categoryGroups.map((category) => category.name),
    categoryGroups,
    statuses: [...networkInventoryStatusOptions],
    types: categoryGroups.flatMap((category) => category.types.map((type) => type.name)),
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
  allRows = false,
) {
  const canView = canViewWarehouseForUser(user, "NETWORK");
  const baseWhere = {
    isActive: true,
    warehouse: { code: "NETWORK" },
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

  const where = buildNetworkInventoryWhere(filters, user.id);
  const skip = (filters.page - 1) * filters.pageSize;
  const [filterOptions, metrics, rawRows, total] = await Promise.all([
    getNetworkFilterOptions(),
    getNetworkMetrics(baseWhere),
    db.asset.findMany({
      orderBy: buildInventoryOrderBy(filters),
      select: networkAssetSelect,
      ...(allRows ? {} : { skip, take: filters.pageSize }),
      where,
    }),
    db.asset.count({ where }),
  ]);
  const availabilityById = await getAvailabilityByAssetId(rawRows, { userId: user.id });
  const rows = rawRows.map((row) => {
    const availability = availabilityById.get(row.id);

    return {
      ...row,
      availableQuantity: availability?.availableQuantity ?? 0,
      reservedQuantity: availability?.reservedQuantity ?? 0,
      totalQuantity: availability?.totalQuantity ?? 1,
    };
  });

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




