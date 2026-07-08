import { AssetActionType, AssetStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { getVisibleDomainCodes } from "@/lib/assets";
import { db } from "@/lib/db";

export const dashboardRecentTabs = [
  "REGISTER",
  AssetStatus.BORROW,
  AssetStatus.USING,
  AssetStatus.SOLD,
] as const;

export type DashboardRecentTab = (typeof dashboardRecentTabs)[number];

const recentAssetSelect = Prisma.validator<Prisma.AssetStatusHistorySelect>()({
  id: true,
  actionType: true,
  changedAt: true,
  fromStatus: true,
  note: true,
  toStatus: true,
  asset: {
    select: {
      id: true,
      serialNo: true,
      status: true,
      assetModel: {
        select: {
          brand: true,
          name: true,
        },
      },
      domain: { select: { code: true } },
    },
  },
  changedBy: {
    select: {
      name: true,
    },
  },
});

export type RecentAssetActivity = Prisma.AssetStatusHistoryGetPayload<{
  select: typeof recentAssetSelect;
}>;

export function normalizeDashboardRecentTab(
  value: string | string[] | undefined,
): DashboardRecentTab {
  const tab = Array.isArray(value) ? value[0] : value;

  return dashboardRecentTabs.includes(tab as DashboardRecentTab)
    ? (tab as DashboardRecentTab)
    : "REGISTER";
}

function buildVisibleAssetWhere(user: CurrentUser): Prisma.AssetWhereInput {
  return {
    isActive: true,
    domain: { code: { in: getVisibleDomainCodes(user) } },
  };
}

function buildVisibleHistoryWhere(
  user: CurrentUser,
  options: { includeInactive?: boolean } = {},
): Prisma.AssetStatusHistoryWhereInput {
  return {
    asset: options.includeInactive
      ? { domain: { code: { in: getVisibleDomainCodes(user) } } }
      : buildVisibleAssetWhere(user),
  };
}

function buildRecentTableWhere(
  user: CurrentUser,
  tab: DashboardRecentTab,
): Prisma.AssetStatusHistoryWhereInput {
  const visibleWhere = buildVisibleHistoryWhere(user);

  if (tab === "REGISTER") {
    return {
      ...visibleWhere,
      actionType: { in: [AssetActionType.CREATE, AssetActionType.IMPORT] },
    };
  }

  return {
    ...visibleWhere,
    toStatus: tab,
  };
}

function getStatusCount(
  groups: Array<{ _count: { _all: number }; status: AssetStatus }>,
  status: AssetStatus,
) {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

export async function getDashboardOverviewForUser(
  user: CurrentUser,
  recentTab: DashboardRecentTab,
) {
  const assetWhere = buildVisibleAssetWhere(user);
  const historyWhere = buildVisibleHistoryWhere(user, { includeInactive: true });
  const [statusGroups, activity, recentRows] = await Promise.all([
    db.asset.groupBy({
      _count: { _all: true },
      by: ["status"],
      where: assetWhere,
    }),
    db.assetStatusHistory.findMany({
      orderBy: { changedAt: "desc" },
      select: recentAssetSelect,
      take: 18,
      where: historyWhere,
    }),
    db.assetStatusHistory.findMany({
      orderBy: { changedAt: "desc" },
      select: recentAssetSelect,
      take: 50,
      where: buildRecentTableWhere(user, recentTab),
    }),
  ]);
  const totalAssets = statusGroups.reduce(
    (total, group) => total + group._count._all,
    0,
  );

  return {
    activity,
    metrics: {
      borrowedAssets: getStatusCount(statusGroups, AssetStatus.BORROW),
      readyAssets: getStatusCount(statusGroups, AssetStatus.READY),
      soldAssets: getStatusCount(statusGroups, AssetStatus.SOLD),
      totalAssets,
    },
    problems: {
      failAssets: getStatusCount(statusGroups, AssetStatus.FAIL),
      lostAssets: getStatusCount(statusGroups, AssetStatus.LOST),
      needCheckAssets: getStatusCount(statusGroups, AssetStatus.NEED_CHECK),
    },
    recentRows,
    recentTab,
  };
}

