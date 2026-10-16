"use client";

import { formatProjectLabel } from "@/lib/project-label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ShoppingBasket,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import { formatWarehouseName } from "@/lib/display-labels";
import { organizationTagLabel } from "@/lib/user-management-shared";

type TransactionTypeCode = "BORROW" | "USING" | "SOLD";

export type RequestCartAssetClient = {
  assetModel: {
    brand: string | null;
    category: { name: string } | null;
    description: string | null;
    name: string;
    partNo: string | null;
    typeName: string | null;
  };
  availableQuantity: number;
  warehouse: { code: string; name: string };
  id: string;
  location: { name: string } | null;
  locationText: string | null;
  requestLockedAt: string | null;
  requestedQuantity: number;
  reservedQuantity: number;
  serialNo: string | null;
  status: string;
  stockCode: string | null;
  totalQuantity: number;
};

export type RequestCartProjectClient = {
  customerName: string;
  id: string;
  name: string;
  projectId: string | null;
};

type RequestCartClientProps = {
  initialAssets: RequestCartAssetClient[];
  organizationAssignments: Array<{
    id: string;
    isPrimary: boolean;
    organizationLevel: string;
    organizationTag: string;
  }>;
  projects: RequestCartProjectClient[];
};


function formatWarehouse(warehouseCode: string) {
  return formatWarehouseName(warehouseCode.charAt(0) + warehouseCode.slice(1).toLowerCase());
}

function getServiceReferencePlaceholder() {
  return "Enter customer name";
}

function assetLocation(asset: RequestCartAssetClient) {
  return asset.location?.name ?? asset.locationText ?? "-";
}

type RequestCartGroup = {
  key: string;
  assets: RequestCartAssetClient[];
  representative: RequestCartAssetClient;
  quantity: number;
};

function groupRequestAssets(assets: RequestCartAssetClient[]): RequestCartGroup[] {
  const groups = new Map<string, RequestCartGroup>();
  for (const asset of assets) {
    const key = JSON.stringify([
      asset.warehouse.code,
      asset.assetModel.category?.name ?? "",
      asset.assetModel.typeName ?? "",
      asset.assetModel.name,
      asset.assetModel.partNo ?? "",
      asset.assetModel.description ?? "",
      asset.assetModel.brand ?? "",
    ]);
    const group = groups.get(key);
    if (group) {
      group.assets.push(asset);
      group.quantity += asset.requestedQuantity;
    } else {
      groups.set(key, { key, assets: [asset], representative: asset, quantity: asset.requestedQuantity });
    }
  }
  return [...groups.values()];
}

function RequestItemCard({
  group,
  isRemoving,
  onRemove,
}: {
  group: RequestCartGroup;
  isRemoving: boolean;
  onRemove: (assetIds: string[]) => void;
}) {
  const asset = group.representative;
  return (
    <article className="grid gap-4 rounded-md border border-border bg-white p-4 shadow-sm md:grid-cols-[56px_1fr_auto]">
      <span className="flex h-14 w-14 items-center justify-center rounded-md bg-navy text-white">
        <Package className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-navy">{asset.assetModel.name}</h3>
          <span className="rounded-full bg-brand-accent/15 px-2.5 py-1 text-[11px] font-bold uppercase text-brand-accent">
            {formatWarehouse(asset.warehouse.code)}
          </span>
        </div>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {[asset.assetModel.category?.name, asset.assetModel.typeName, asset.assetModel.brand, asset.assetModel.partNo]
            .filter(Boolean).join(" / ") || "-"}
        </p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          Location: {assetLocation(asset)}
        </p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          Qty: {group.quantity.toLocaleString("en-US")}
        </p>
      </div>
      <button
        aria-label={`Remove ${asset.assetModel.name}`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-status-fail hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isRemoving}
        onClick={() => onRemove(group.assets.map((item) => item.id))}
        type="button"
      >
        {isRemoving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </article>
  );
}

function EmptyRequestList() {
  return (
    <div className="rounded-md border border-dashed border-border bg-white p-8 text-center">
      <ShoppingBasket className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-bold text-navy">Request list is empty</h3>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Select items and quantities from inventory before submitting a request.
      </p>
    </div>
  );
}

function RequestList({
  assets,
  isClearing,
  onClearAll,
  onRemove,
  removingAssetId,
}: {
  assets: RequestCartAssetClient[];
  isClearing: boolean;
  onClearAll: () => void;
  onRemove: (assetIds: string[]) => void;
  removingAssetId: string | null;
}) {
  const groups = groupRequestAssets(assets);
  return (
    <section className="rounded-md border border-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Request List ({groups.length})
        </p>
        {groups.length > 0 ? (
          <button
            className="text-sm font-bold text-brand-accent hover:text-navy disabled:opacity-50"
            disabled={isClearing}
            onClick={onClearAll}
            type="button"
          >
            Clear All
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        {groups.length === 0 ? (
          <EmptyRequestList />
        ) : (
          groups.map((group) => (
            <RequestItemCard
              group={group}
              isRemoving={group.assets.some((asset) => removingAssetId === asset.id) || isClearing}
              key={group.key}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TransactionTypeSelect({
  onChange,
  value,
}: {
  onChange: (value: TransactionTypeCode) => void;
  value: TransactionTypeCode;
}) {
  return (
    <SearchableDropdown
      onChange={(nextValue) => onChange(nextValue as TransactionTypeCode)}
      options={[
        { label: "Borrow", value: "BORROW" },
        { label: "Using", value: "USING" },
        { label: "Sold", value: "SOLD" },
      ]}
      placeholder="Select transaction type"
      searchPlaceholder="Search transaction type"
      value={value}
    />
  );
}

function TransactionForm({
  assetCount,
  error,
  isSubmitting,
  note,
  onNoteChange,
  onProjectChange,
  onProjectRequestChange,
  onRequestContextChange,
  onReferenceChange,
  onServiceRequestChange,
  onSubmit,
  onTypeChange,
  projectId,
  projectRequest,
  projects,
  referenceName,
  requestContextAssignmentId,
  requestContextOptions,
  serviceRequest,
  type,
}: {
  assetCount: number;
  error: string | null;
  isSubmitting: boolean;
  note: string;
  onNoteChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onProjectRequestChange: (checked: boolean) => void;
  onRequestContextChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onServiceRequestChange: (checked: boolean) => void;
  onSubmit: () => void;
  onTypeChange: (value: TransactionTypeCode) => void;
  projectId: string;
  projectRequest: boolean;
  projects: RequestCartProjectClient[];
  referenceName: string;
  requestContextAssignmentId: string;
  requestContextOptions: Array<{
    description?: string;
    label: string;
    searchText: string;
    value: string;
  }>;
  serviceRequest: boolean;
  type: TransactionTypeCode;
}) {
  const showReferenceName = type !== "USING";
  const projectOptions = projects.map((project) => ({
    label: formatProjectLabel(project),
    searchText: [project.name, project.projectId, project.customerName].filter(Boolean).join(" "),
    value: project.id,
  }));

  return (
    <aside className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-navy">Transaction Details</h2>
        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span>
              Transaction Type <RequiredMark />
            </span>
            <TransactionTypeSelect onChange={onTypeChange} value={type} />
          </label>

          {requestContextOptions.length > 1 ? (
            <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span>
                Request Context <RequiredMark />
              </span>
              <SearchableDropdown
                onChange={onRequestContextChange}
                options={requestContextOptions}
                placeholder="Select request context"
                searchPlaceholder="Search request context"
                value={requestContextAssignmentId}
              />
            </label>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Request Kind <RequiredMark />
            </p>
            {type === "USING" ? (
              <div className="rounded-md border border-border bg-surface/40 px-3 py-2 text-sm font-semibold text-navy">
                Internal
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    checked: serviceRequest,
                    label: "Service",
                    onChange: onServiceRequestChange,
                  },
                  {
                    checked: projectRequest,
                    label: "Project",
                    onChange: onProjectRequestChange,
                  },
                ].map((item) => (
                  <label
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/40 px-3 py-2 text-sm font-semibold text-navy"
                    key={item.label}
                  >
                    <input
                      checked={item.checked}
                      className="h-4 w-4 rounded border-border text-brand-accent focus:ring-brand-accent"
                      onChange={(event) => item.onChange(event.target.checked)}
                      type="checkbox"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {showReferenceName && serviceRequest ? (
            <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span>
                Customer Name <RequiredMark />
              </span>
              <input
                className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none ring-brand-accent/20 focus:ring-4"
                onChange={(event) => onReferenceChange(event.target.value)}
                placeholder={getServiceReferencePlaceholder()}
                value={referenceName}
              />
            </label>
          ) : null}
          {showReferenceName && projectRequest ? (
            <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span>
                Project <RequiredMark />
              </span>
              <SearchableDropdown
                emptyText="No participating projects found."
                onChange={onProjectChange}
                options={projectOptions}
                placeholder="Select project"
                searchPlaceholder="Search project"
                value={projectId}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span>
              Use Detail <RequiredMark />
            </span>
            <textarea
              className="min-h-28 rounded-md border border-border bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none ring-brand-accent/20 focus:ring-4"
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Describe what these assets will be used for"
              value={note}
            />
          </label>
        </div>
        <div className="mt-5 border-t border-border pt-4 text-sm font-semibold">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Total Items Selected</span>
            <span className="text-navy">{assetCount} Assets</span>
          </div>
          <div className="mt-3 flex justify-between gap-4">
            <span className="text-muted-foreground">Request Status</span>
            <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold uppercase text-navy">
              Draft
            </span>
          </div>
        </div>
        {error ? (
          <p className="mt-4 flex gap-2 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
        <button
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || assetCount === 0}
          onClick={onSubmit}
          type="button"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          Submit Request
        </button>
      </section>
    </aside>
  );
}

function RequiredMark() {
  return <span className="text-status-fail">*</span>;
}

async function readApiMessage(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "Request failed.");
  }

  return data;
}

export function RequestCartClient({
  initialAssets,
  organizationAssignments,
  projects,
}: RequestCartClientProps) {
  const [assets, setAssets] = useState(initialAssets);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TransactionTypeCode>("BORROW");
  const internalRequest = type === "USING";
  const [isClearing, setIsClearing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectRequest, setProjectRequest] = useState(false);
  const [referenceName, setReferenceName] = useState("");
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);
  const primaryAssignment =
    organizationAssignments.find((assignment) => assignment.isPrimary) ??
    organizationAssignments[0];
  const [requestContextAssignmentId, setRequestContextAssignmentId] = useState(
    primaryAssignment?.id ?? "",
  );
  const [serviceRequest, setServiceRequest] = useState(false);
  const router = useRouter();
  const requestContextOptions = organizationAssignments.map((assignment) => ({
    description: assignment.isPrimary ? "Primary" : undefined,
    label: `${assignment.organizationLevel} / ${organizationTagLabel(assignment.organizationTag)}`,
    searchText: `${assignment.organizationLevel} ${assignment.organizationTag} ${organizationTagLabel(assignment.organizationTag)}`,
    value: assignment.id,
  }));

  function handleTypeChange(nextType: TransactionTypeCode) {
    setType(nextType);

    if (nextType === "USING") {
      setServiceRequest(false);
      setProjectRequest(false);
      setReferenceName("");
      setProjectId("");
    }

  }

  function handleServiceRequestChange(checked: boolean) {
    setServiceRequest(checked);

    if (checked) {
      setProjectRequest(false);
      setProjectId("");
    }
  }

  function handleProjectRequestChange(checked: boolean) {
    setProjectRequest(checked);

    if (checked) {
      setServiceRequest(false);
      setReferenceName("");
    }
  }

  async function releaseAssets(assetIds: string[]) {
    const selectedAssets = assets.filter((asset) => assetIds.includes(asset.id));
    const response = await fetch("/api/requests/release", {
      body: JSON.stringify({
        items: selectedAssets.map((asset) => ({
          assetId: asset.id,
          quantity: asset.requestedQuantity,
        })),
        note: "Removed from request page.",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    await readApiMessage(response);
    setAssets((current) => current.filter((asset) => !assetIds.includes(asset.id)));
  }

  async function handleRemove(assetIds: string[]) {
    setError(null);
    setRemovingAssetId(assetIds[0] ?? null);

    try {
      await releaseAssets(assetIds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove asset.");
    } finally {
      setRemovingAssetId(null);
    }
  }

  async function handleClearAll() {
    setError(null);
    setIsClearing(true);

    try {
      await releaseAssets(assets.map((asset) => asset.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to clear request.");
    } finally {
      setIsClearing(false);
    }
  }

  function validateSubmit() {
    const missingFields: string[] = [];

    if (assets.length === 0) {
      missingFields.push("Request list");
    }

    if (type !== "USING" && serviceRequest && !referenceName.trim()) {
      missingFields.push("Customer Name");
    }

    if (type !== "USING" && projectRequest && !projectId) {
      missingFields.push("Project");
    }

    if (!note.trim()) {
      missingFields.push("Use Detail");
    }

    if (requestContextOptions.length > 1 && !requestContextAssignmentId) {
      missingFields.push("Request Context");
    }

    if (type !== "USING" && !serviceRequest && !projectRequest) {
      missingFields.push("Service / Project");
    }
    if (missingFields.length > 0) {
      return `Please complete: ${missingFields.join(", ")}.`;
    }

    return null;
  }

  async function handleSubmit() {
    const validationError = validateSubmit();
    setError(validationError);

    if (validationError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/transactions", {
        body: JSON.stringify({
          items: assets.map((asset) => ({
            assetId: asset.id,
            quantity: asset.requestedQuantity,
          })),
          dueDate: null,
          internalRequest,
          note,
          projectId: type === "USING" || !projectRequest ? null : projectId,
          projectRequest: type === "USING" ? false : projectRequest,
          purpose: type === "USING" ? "Internal use" : projectRequest ? projects.find((project) => project.id === projectId)?.name ?? "Project" : referenceName,
          requestContextAssignmentId: requestContextAssignmentId || null,
          serviceRequest: type === "USING" ? false : serviceRequest,
          soldPrice: null,
          type,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await readApiMessage(response);
      setAssets([]);
      router.push("/logs");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RequestList
          assets={assets}
          isClearing={isClearing}
          onClearAll={handleClearAll}
          onRemove={handleRemove}
          removingAssetId={removingAssetId}
        />
        <TransactionForm
          assetCount={assets.reduce((sum, asset) => sum + asset.requestedQuantity, 0)}
          error={error}
          isSubmitting={isSubmitting}
          note={note}
          onNoteChange={setNote}
          onProjectChange={setProjectId}
          onProjectRequestChange={handleProjectRequestChange}
          onRequestContextChange={setRequestContextAssignmentId}
          onReferenceChange={setReferenceName}
          onServiceRequestChange={handleServiceRequestChange}
          onSubmit={handleSubmit}
          onTypeChange={handleTypeChange}
          projectId={projectId}
          projectRequest={projectRequest}
          projects={projects}
          referenceName={referenceName}
          requestContextAssignmentId={requestContextAssignmentId}
          requestContextOptions={requestContextOptions}
          serviceRequest={serviceRequest}
          type={type}
        />
      </div>
    </div>
  );
}

