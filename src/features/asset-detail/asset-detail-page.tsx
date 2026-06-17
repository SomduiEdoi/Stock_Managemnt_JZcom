import type { AssetActionType, AssetStatus } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  FileText,
  Hash,
  History,
  LockKeyhole,
  MapPin,
  Package,
  Pencil,
  Tag,
  UserRound,
} from "lucide-react";
import type { AssetDetailRecord } from "@/lib/asset-detail";
import { transactionStatusLabels } from "@/lib/status-style";
import { ExportPdfButton } from "@/features/asset-detail/export-pdf-button";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

const actionLabels = {
  CREATE: "Create",
  IMPORT: "Import",
  MARK_FAIL: "Mark Fail",
  MARK_LOST: "Mark Lost",
  MARK_NEED_CHECK: "Need Check",
  REQUEST_HOLD: "Request Hold",
  REQUEST_SUBMIT: "Request Submit",
  RETURN: "Return",
  STATUS_CHANGE: "Status Change",
} as const satisfies Record<AssetActionType, string>;

type DetailItem = {
  label: string;
  value: string;
};

type AssetDetailPageProps = {
  asset: AssetDetailRecord;
  canManage: boolean;
};

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function personName(person: { email: string; name: string } | null | undefined) {
  if (!person) {
    return "-";
  }

  return person.name || person.email;
}

function fallback(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function domainHref(code: string) {
  return code === "SERVER" ? "/dashboard/server" : "/dashboard/network";
}

function domainLabel(asset: AssetDetailRecord) {
  return asset.domain.name || asset.domain.code.toLowerCase();
}

function AssetImagePanel({ asset }: { asset: AssetDetailRecord }) {
  if (asset.imageRef) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-white">
        <Image
          alt={asset.assetModel.name}
          className="object-cover"
          fill
          sizes="(min-width: 1280px) 360px, 100vw"
          src={asset.imageRef}
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-surface">
      <div className="text-center">
        <Package className="mx-auto h-14 w-14 text-navy" />
        <p className="mt-3 text-sm font-bold text-navy">{asset.domain.name}</p>
      </div>
    </div>
  );
}

function DetailGrid({ items }: { items: DetailItem[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-navy">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-bold text-navy">{value}</p>
        </div>
      </div>
    </div>
  );
}

function AssetHeader({ asset, canManage }: AssetDetailPageProps) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted-foreground"
        >
          <Link className="text-navy hover:underline" href={domainHref(asset.domain.code)}>
            {domainLabel(asset)}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-navy">{asset.assetModel.name}</span>
        </nav>
        <h1 className="mt-3 text-3xl font-bold text-navy">
          {asset.assetModel.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <AssetStatusBadge status={asset.status} />
          <span className="text-sm font-medium text-muted-foreground">
            Last updated {formatDateTime(asset.updatedAt)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <ExportPdfButton />
        {canManage ? (
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white"
            href={`/dashboard/assets/${asset.id}/edit`}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function buildPrimaryDetails(asset: AssetDetailRecord): DetailItem[] {
  return [
    { label: "Brand", value: fallback(asset.assetModel.brand) },
    { label: "Category", value: fallback(asset.assetModel.category?.name) },
    { label: "Type", value: fallback(asset.assetModel.typeName) },
    { label: "Part No.", value: fallback(asset.assetModel.partNo) },
    { label: "QTY", value: fallback(asset.legacyQty) },
    { label: "FG", value: fallback(asset.legacyFg) },
  ];
}

function AssetDetails({ asset }: { asset: AssetDetailRecord }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <AssetImagePanel asset={asset} />
      <div className="rounded-md border border-border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-navy" />
          <h2 className="text-xl font-bold text-navy">Details</h2>
        </div>
        <DetailGrid items={buildPrimaryDetails(asset)} />

        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Remark
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-ink">
            {asset.note || "-"}
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryTiles({ asset }: { asset: AssetDetailRecord }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryTile icon={Hash} label="Serial No." value={asset.serialNo} />
      <SummaryTile
        icon={Tag}
        label="Stock Code"
        value={fallback(asset.stockCode)}
      />
      <SummaryTile
        icon={MapPin}
        label="Location"
        value={fallback(asset.location?.name ?? asset.locationText)}
      />
      <SummaryTile
        icon={LockKeyhole}
        label="Request Lock"
        value={asset.requestLockedBy ? personName(asset.requestLockedBy) : "No active lock"}
      />
    </section>
  );
}

function HistoryTable({ asset }: { asset: AssetDetailRecord }) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-navy" />
          <h2 className="text-xl font-bold text-navy">Transaction History</h2>
        </div>
        <p className="text-sm font-semibold text-muted-foreground">
          {asset.statusHistories.length.toLocaleString("en-US")} records
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-bold">Request No.</th>
              <th className="px-5 py-4 font-bold">Requester</th>
              <th className="px-5 py-4 font-bold">Changed By</th>
              <th className="px-5 py-4 font-bold">Date</th>
              <th className="px-5 py-4 font-bold">Status Change</th>
              <th className="px-5 py-4 font-bold">Action</th>
              <th className="px-5 py-4 font-bold">Transaction</th>
              <th className="px-5 py-4 font-bold">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {asset.statusHistories.map((history) => (
              <HistoryRow history={history} key={history.id} />
            ))}
          </tbody>
        </table>
      </div>
      {asset.statusHistories.length === 0 ? <EmptyHistory /> : null}
    </section>
  );
}

function HistoryRow({
  history,
}: {
  history: AssetDetailRecord["statusHistories"][number];
}) {
  const transaction = history.transaction;
  const transactionText = transaction
    ? `${transaction.type} / ${transactionStatusLabels[transaction.status]}`
    : "-";

  return (
    <tr className="align-top">
      <td className="px-5 py-4 font-bold text-navy">
        {transaction?.transactionNo ?? "-"}
      </td>
      <td className="px-5 py-4 text-ink">
        {personName(transaction?.requestedBy)}
      </td>
      <td className="px-5 py-4 text-ink">{personName(history.changedBy)}</td>
      <td className="px-5 py-4 text-muted-foreground">
        {formatDateTime(history.changedAt)}
      </td>
      <td className="px-5 py-4">
        <StatusChange from={history.fromStatus} to={history.toStatus} />
      </td>
      <td className="px-5 py-4 font-medium text-ink">
        {actionLabels[history.actionType]}
      </td>
      <td className="px-5 py-4 text-muted-foreground">{transactionText}</td>
      <td className="max-w-[280px] px-5 py-4 text-muted-foreground">
        {history.note ?? transaction?.purpose ?? "-"}
      </td>
    </tr>
  );
}

function StatusChange({
  from,
  to,
}: {
  from: AssetStatus | null;
  to: AssetStatus;
}) {
  return (
    <div className="flex min-w-[210px] items-center gap-2">
      <StatusPill status={from} />
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      <StatusPill status={to} />
    </div>
  );
}

function StatusPill({ status }: { status: AssetStatus | null }) {
  if (!status) {
    return (
      <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-muted-foreground">
        -
      </span>
    );
  }

  return <AssetStatusBadge status={status} />;
}

function EmptyHistory() {
  return (
    <div className="border-t border-border px-5 py-10 text-center">
      <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-muted-foreground">
        No transaction history for this asset yet.
      </p>
    </div>
  );
}

function ForbiddenState() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <UserRound className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-bold text-navy">No access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account does not have permission to view this asset.
      </p>
    </section>
  );
}

export function AssetDetailForbidden() {
  return <ForbiddenState />;
}

export function AssetDetailPage({ asset, canManage }: AssetDetailPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <AssetHeader asset={asset} canManage={canManage} />
      <SummaryTiles asset={asset} />
      <AssetDetails asset={asset} />
      <HistoryTable asset={asset} />
    </div>
  );
}
