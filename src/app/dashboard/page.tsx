import type { ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  CircleX,
  DollarSign,
  Package,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { AssetActionType, AssetStatus } from "@prisma/client";
import { requireCurrentUser } from "@/lib/auth";
import {
  dashboardRecentTabs,
  getDashboardOverviewForUser,
  normalizeDashboardRecentTab,
  type DashboardRecentTab,
  type RecentAssetActivity,
} from "@/lib/dashboard";
import {
  assetStatusBadgeClasses,
  assetStatusLabels,
} from "@/lib/status-style";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type MetricCardProps = {
  detail: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: "accent" | "borrow" | "ready" | "sold";
  value: number;
};

const recentTabLabels: Record<DashboardRecentTab, string> = {
  REGISTER: "Register",
  [AssetStatus.BORROW]: "Borrow",
  [AssetStatus.USING]: "Using",
  [AssetStatus.SOLD]: "Sold",
};

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function describeActivity(activity: RecentAssetActivity) {
  if (
    activity.actionType === AssetActionType.CREATE ||
    activity.actionType === AssetActionType.IMPORT
  ) {
    return "New Asset registered";
  }

  return `${activity.asset.serialNo} updated to ${
    assetStatusLabels[activity.toStatus]
  }`;
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: MetricCardProps) {
  const toneClasses = {
    accent: "text-brand-accent",
    borrow: "text-status-borrow",
    ready: "text-status-ready",
    sold: "text-status-sold",
  };

  return (
    <article className="rounded-md border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-4 text-3xl font-bold leading-none text-ink">
            {formatNumber(value)}
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-navy">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className={`mt-4 text-xs font-semibold ${toneClasses[tone]}`}>
        {detail}
      </p>
    </article>
  );
}

function ProblemItems({
  fail,
  lost,
  needCheck,
}: {
  fail: number;
  lost: number;
  needCheck: number;
}) {
  const items: Array<{
    count: number;
    icon: ComponentType<{ className?: string }>;
    iconTone: string;
    label: string;
  }> = [
    {
      count: fail,
      icon: CircleX,
      iconTone: "bg-status-fail/10 text-status-fail",
      label: "Fail",
    },
    {
      count: lost,
      icon: SearchX,
      iconTone: "bg-status-lost/10 text-status-lost",
      label: "Lost",
    },
    {
      count: needCheck,
      icon: AlertTriangle,
      iconTone: "bg-status-need-check/10 text-status-need-check",
      label: "Need Check",
    },
  ];

  return (
    <section className="rounded-md border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 pt-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-status-fail" />
          <h3 className="text-lg font-bold text-navy">Problem Items</h3>
        </div>
        <Link
          className="inline-flex items-center gap-1 text-xs font-bold text-navy transition hover:text-brand-accent"
          href="/dashboard/assets?status=FAIL"
        >
          View All
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid px-5 pb-4 pt-3 sm:grid-cols-3">
        {items.map((item, index) => {
          const Icon = item.icon;
          const count =
            item.count < 10
              ? item.count.toString().padStart(2, "0")
              : formatNumber(item.count);

          return (
            <div
              className={`flex items-center gap-3 py-3 ${
                index > 0
                  ? "border-t border-border sm:border-l sm:border-t-0 sm:pl-6"
                  : ""
              } ${index < items.length - 1 ? "sm:pr-6" : ""}`}
              key={item.label}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${item.iconTone}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <p className="text-2xl font-bold leading-none text-ink tabular-nums">
                {count}
              </p>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityFeed({ activity }: { activity: RecentAssetActivity[] }) {
  return (
    <aside className="rounded-md border border-border bg-white shadow-sm xl:row-span-2">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-xl font-bold text-navy">Activity Feed</h3>
        <RefreshCw className="h-4 w-4 text-navy" />
      </div>
      <div className="max-h-[520px] overflow-y-auto px-5 py-3">
        <div className="flex flex-col gap-1">
          {activity.map((item) => (
            <div className="grid grid-cols-[34px_1fr] gap-3 py-3" key={item.id}>
              <span
                className={`mt-1 h-3 w-3 rounded-full ${
                  assetStatusBadgeClasses[item.toStatus].split(" ")[0]
                }`}
              />
              <div>
                <p className="text-sm font-bold leading-5 text-navy">
                  {describeActivity(item)}
                </p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {item.changedBy.name} • {formatTime(item.changedAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function RecentTabs({ activeTab }: { activeTab: DashboardRecentTab }) {
  return (
    <div className="flex flex-wrap gap-2">
      {dashboardRecentTabs.map((tab) => {
        const isActive = tab === activeTab;

        return (
          <Link
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              isActive
                ? "bg-navy text-white"
                : "bg-surface text-muted-foreground hover:text-navy"
            }`}
            href={`/dashboard?recent=${tab}`}
            key={tab}
          >
            {recentTabLabels[tab]}
          </Link>
        );
      })}
    </div>
  );
}

function RecentTable({
  activeTab,
  rows,
}: {
  activeTab: DashboardRecentTab;
  rows: RecentAssetActivity[];
}) {
  return (
    <section className="rounded-md border border-border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-bold text-navy">Recently</h3>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {recentTabLabels[activeTab]}
          </p>
        </div>
        <RecentTabs activeTab={activeTab} />
      </div>
      <div className="max-h-[620px] overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-bold">Model</th>
              <th className="px-5 py-3 font-bold">Brand</th>
              <th className="px-5 py-3 font-bold">Serial No.</th>
              <th className="px-5 py-3 font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr className="align-middle" key={row.id}>
                <td className="px-5 py-4 font-semibold text-navy">
                  {row.asset.assetModel.name}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {row.asset.assetModel.brand ?? "-"}
                </td>
                <td className="px-5 py-4 font-medium text-ink">
                  {row.asset.serialNo}
                </td>
                <td className="px-5 py-4">
                  <AssetStatusBadge status={row.asset.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="border-t border-border px-5 py-8 text-center text-sm font-medium text-muted-foreground">
          No records found.
        </div>
      ) : null}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await requireCurrentUser("/dashboard");
  const params = await searchParams;
  const recentTab = normalizeDashboardRecentTab(params.recent);
  const overview = await getDashboardOverviewForUser(user, recentTab);
  const readyPercent =
    overview.metrics.totalAssets > 0
      ? Math.round(
          (overview.metrics.readyAssets / overview.metrics.totalAssets) * 100,
        )
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail="Visible in your scope"
          icon={Package}
          label="Total Assets"
          tone="accent"
          value={overview.metrics.totalAssets}
        />
        <MetricCard
          detail={`${readyPercent}% of visible assets`}
          icon={CheckCircle2}
          label="Items Ready"
          tone="ready"
          value={overview.metrics.readyAssets}
        />
        <MetricCard
          detail="Currently borrowed"
          icon={ArrowRightLeft}
          label="Borrowed"
          tone="borrow"
          value={overview.metrics.borrowedAssets}
        />
        <MetricCard
          detail="Moved to sold state"
          icon={DollarSign}
          label="Sold"
          tone="sold"
          value={overview.metrics.soldAssets}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProblemItems
            fail={overview.problems.failAssets}
            lost={overview.problems.lostAssets}
            needCheck={overview.problems.needCheckAssets}
          />
          <RecentTable activeTab={overview.recentTab} rows={overview.recentRows} />
        </div>
        <ActivityFeed activity={overview.activity} />
      </section>
    </div>
  );
}
