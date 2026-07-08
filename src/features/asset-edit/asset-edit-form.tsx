"use client";

import { AssetStatus } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ChevronRight,
  ImagePlus,
  Loader2,
  Package,
  Save,
  Trash2,
} from "lucide-react";
import type { AssetEditOptions, AssetEditRecord } from "@/lib/asset-edit";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";

type AssetEditFormProps = {
  canChangeDomain: boolean;
  initialDomainCode?: string;
  lockDomain?: boolean;
  mode: "create" | "edit";
  options: AssetEditOptions;
} & (
  | {
      asset: AssetEditRecord;
      mode: "edit";
    }
  | {
      asset?: never;
      mode: "create";
    }
);

type AssetEditFormState = {
  brand: string;
  categoryName: string;
  description: string;
  domainCode: string;
  imageRef: string;
  location: string;
  modelName: string;
  note: string;
  partNo: string;
  serialNo: string;
  status: AssetStatus;
  typeName: string;
};

type AssetEditFieldKey =
  | "brand"
  | "categoryName"
  | "domainCode"
  | "location"
  | "modelName"
  | "partNo"
  | "serialNo"
  | "status"
  | "typeName";

type AssetEditFieldErrors = Partial<Record<AssetEditFieldKey, string>>;

function domainHref(code: string) {
  if (code === "SERVER") return "/dashboard/server";
  if (code === "NETWORK") return "/dashboard/network";
  return `/dashboard/inventory/${encodeURIComponent(code)}`;
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function isAscii(value: string) {
  return !/[^\x00-\x7F]/.test(value);
}

function validatePattern(
  value: string,
  label: string,
  options: { allowed: string; max: number; min: number; pattern: RegExp },
) {
  const trimmed = value.trim();

  if (!trimmed) {
    return `${label} is required.`;
  }

  if (!isAscii(trimmed)) {
    return `${label} must not contain Thai characters. English only.`;
  }

  if (trimmed.length < options.min || trimmed.length > options.max) {
    return `${label} must be ${options.min}-${options.max} characters.`;
  }

  if (!options.pattern.test(trimmed)) {
    return `${label} contains invalid characters. Allowed symbols: ${options.allowed}.`;
  }

  return null;
}

function validateAssetForm(
  form: AssetEditFormState,
  trackMethod: "SERIAL" | "QUANTITY",
) {
  const fieldErrors: AssetEditFieldErrors = {};
  const modelError = validatePattern(form.modelName, "Asset model", {
    allowed: "space - / ( ) + .",
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 \-\/()+.]+$/,
  });
  const brandError = validatePattern(form.brand, "Brand", {
    allowed: "space - / ( ) + .",
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 \-\/()+.]+$/,
  });
  const locationError = validatePattern(form.location, "Location", {
    allowed: "space - . / ,",
    max: 30,
    min: 2,
    pattern: /^[A-Za-z0-9 ,\-.\/]+$/,
  });
  const partNoError = validatePattern(form.partNo, "Part no.", {
    allowed: "- / .",
    max: 20,
    min: 2,
    pattern: /^[A-Za-z0-9\-\/.]+$/,
  });

  if (modelError) fieldErrors.modelName = modelError;
  if (brandError) fieldErrors.brand = brandError;
  if (locationError) fieldErrors.location = locationError;
  if (partNoError) fieldErrors.partNo = partNoError;

  if (trackMethod === "SERIAL") {
    const serialNo = form.serialNo.trim();

    if (!serialNo) {
      fieldErrors.serialNo = "Serial no. is required.";
    } else if (!isAscii(serialNo)) {
      fieldErrors.serialNo = "Serial no. must not contain Thai characters. English only.";
    } else if (!/^[A-Za-z0-9-]+$/.test(serialNo)) {
      fieldErrors.serialNo = "Serial no. allows letters, numbers, and - only. No spaces or other symbols.";
    }
  } else if (form.serialNo.trim()) {
    fieldErrors.serialNo = "Serial no. must be empty for quantity assets.";
  }

  if (!hasText(form.categoryName)) {
    fieldErrors.categoryName = "Category is required.";
  }

  if (!hasText(form.typeName)) {
    fieldErrors.typeName = "Type is required.";
  }

  if (!hasText(form.domainCode)) {
    fieldErrors.domainCode = "Domain is required.";
  }

  if (!hasText(form.status)) {
    fieldErrors.status = "Status is required.";
  }

  return fieldErrors;
}
function toFormState(asset: AssetEditRecord): AssetEditFormState {
  return {
    brand: asset.assetModel.brand ?? "",
    categoryName: asset.assetModel.category?.name ?? "",
    description: asset.assetModel.description ?? "",
    domainCode: asset.domain.code,
    imageRef: asset.imageRef ?? "",
    location: asset.location?.name ?? asset.locationText ?? "",
    modelName: asset.assetModel.name,
    note: asset.note ?? "",
    partNo: asset.assetModel.partNo ?? "",
    serialNo: asset.serialNo ?? "",
    status: asset.status,
    typeName: asset.assetModel.typeName ?? "",
  };
}

function createFormState(initialDomainCode: string): AssetEditFormState {
  return {
    brand: "",
    categoryName: "",
    description: "",
    domainCode: initialDomainCode,
    imageRef: "",
    location: "",
    modelName: "",
    note: "",
    partNo: "",
    serialNo: "",
    status: AssetStatus.READY,
    typeName: "",
  };
}

function Field({
  children,
  error,
  required,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  required?: boolean;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-status-fail">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-semibold text-status-fail">{error}</span>
      ) : null}
    </label>
  );
}

function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  const isInvalid = props["aria-invalid"] === true;

  return (
    <input
      {...props}
      className={[
        "h-11 rounded-md border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4",
        isInvalid ? "border-status-fail" : "border-border",
        props.className,
      ].filter(Boolean).join(" ")}
    />
  );
}

function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const isInvalid = props["aria-invalid"] === true;

  return (
    <textarea
      {...props}
      className={[
        "min-h-32 rounded-md border bg-white px-3 py-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4",
        isInvalid ? "border-status-fail" : "border-border",
        props.className,
      ].filter(Boolean).join(" ")}
    />
  );
}

function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  const isInvalid = props["aria-invalid"] === true;

  return (
    <select
      {...props}
      className={[
        "h-11 rounded-md border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 focus:ring-4",
        isInvalid ? "border-status-fail" : "border-border",
        props.className,
      ].filter(Boolean).join(" ")}
    />
  );
}

export function AssetEditForm(props: AssetEditFormProps) {
  const { canChangeDomain, initialDomainCode, lockDomain = false, mode, options } = props;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AssetEditFieldErrors>({});
  const asset = mode === "edit" ? props.asset : null;
  const [form, setForm] = useState<AssetEditFormState>(() =>
    mode === "edit"
      ? toFormState(props.asset)
      : createFormState(initialDomainCode ?? "SERVER"),
  );
  const [isSaving, setIsSaving] = useState(false);

  function setField<Key extends keyof AssetEditFormState>(
    key: Key,
    value: AssetEditFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Image file must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    const imageData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Unable to read image file."));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Unable to load image.");
      return null;
    });

    if (imageData) {
      setError(null);
      setField("imageRef", imageData);
    }

    event.target.value = "";
  }

  async function handleSave() {
    setError(null);

    const nextFieldErrors = validateAssetForm(form, trackMethod);
    const invalidFields = Object.values(nextFieldErrors);

    if (invalidFields.length > 0) {
      const message = `Please fix these fields:\n${invalidFields.map((field) => `- ${field}`).join("\n")}`;
      setFieldErrors(nextFieldErrors);
      setError(message);
      window.alert(message);
      return;
    }

    setFieldErrors({});
    setIsSaving(true);

    try {
      const response = await fetch(saveUrl, {
        body: JSON.stringify({
          brand: form.brand,
          categoryName: form.categoryName,
          description: form.description,
          domainCode: form.domainCode,
          imageRef: form.imageRef || null,
          locationCode: null,
          locationName: form.location,
          locationText: form.location,
          modelName: form.modelName,
          note: form.note,
          partNo: form.partNo,
          serialNo: isQuantityAsset ? null : form.serialNo,
          status: form.status,
          typeName: form.typeName,
        }),
        headers: { "Content-Type": "application/json" },
        method: mode === "edit" ? "PATCH" : "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        asset?: { id: string };
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to save asset.");
      }

      const nextAssetId = data.asset?.id ?? asset?.id;

      if (!nextAssetId) {
        throw new Error("Asset saved but no asset id was returned.");
      }

      router.push(`/dashboard/assets/${nextAssetId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save asset.");
    } finally {
      setIsSaving(false);
    }
  }

  const visibleCategories = options.categories.filter(
    (category) => category.domainCode === form.domainCode,
  );
  const visibleTypes = options.types.filter(
    (type) => type.domainCode === form.domainCode,
  );
  const selectedType = visibleTypes.find((type) => type.name === form.typeName) ?? null;
  const trackMethod = selectedType?.trackMethod ?? "SERIAL";
  const isQuantityAsset = trackMethod === "QUANTITY";
  const selectedDomain =
    options.domains.find((domain) => domain.code === form.domainCode) ??
    options.domains[0] ??
    null;
  const saveUrl = mode === "edit" && asset ? `/api/assets/${asset.id}` : "/api/assets";
  const cancelHref =
    mode === "edit" && asset ? `/dashboard/assets/${asset.id}` : domainHref(form.domainCode);
  const heading = mode === "edit" && asset ? `Edit ${asset.assetModel.name}` : "Add Asset";
  const submitLabel = mode === "edit" ? "Save Changes" : "Add Asset";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted-foreground"
          >
            <Link className="text-navy hover:underline" href={domainHref(form.domainCode)}>
              {selectedDomain?.name ?? form.domainCode}
            </Link>
            {mode === "edit" && asset ? (
              <>
                <ChevronRight className="h-4 w-4" />
                <Link className="text-navy hover:underline" href={`/dashboard/assets/${asset.id}`}>
                  {asset.assetModel.name}
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span className="text-navy">Edit</span>
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="text-navy">Add</span>
              </>
            )}
          </nav>
          <h1 className="mt-3 text-3xl font-bold text-navy">{heading}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AssetStatusBadge status={form.status} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface"
            href={cancelHref}
          >
            Cancel
          </Link>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {submitLabel}
          </button>
        </div>
      </header>

      {error ? (
        <section className="rounded-md border border-status-fail/20 bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
          {error}
        </section>
      ) : null}

      <section className="grid items-stretch gap-6 xl:grid-cols-[360px_1fr]">
        <div className="rounded-md border border-border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-navy">Asset Image</h2>
          <div className="mt-4">
            {form.imageRef ? (
              <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-white">
                <Image
                  alt={form.modelName}
                  className="object-cover"
                  fill
                  sizes="(min-width: 1280px) 320px, 100vw"
                  src={form.imageRef}
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-md border border-border bg-surface">
                <div className="text-center">
                  <Package className="mx-auto h-12 w-12 text-navy" />
                  <p className="mt-3 text-sm font-bold text-navy">No image</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-navy px-3 text-sm font-bold text-white"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <ImagePlus className="h-4 w-4" />
              Upload Image
            </button>
            <button
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-white px-3 text-sm font-bold text-status-fail"
              onClick={() => setField("imageRef", "")}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          </div>

          <input
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
            ref={fileInputRef}
            type="file"
          />
        </div>

        <section className="rounded-md border border-border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-navy">Asset Details</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              error={fieldErrors.modelName}
              label="Asset Name/Model"
              required
            >
              <Input
                required
                aria-invalid={Boolean(fieldErrors.modelName)}
                onChange={(event) => setField("modelName", event.target.value)}
                placeholder="Enter model name (Symbols allowed: - / ( ) + .)"
                value={form.modelName}
              />
            </Field>
            <Field
              error={fieldErrors.serialNo}
              label="Serial Number"
              required={!isQuantityAsset}
            >
              <Input
                aria-invalid={Boolean(fieldErrors.serialNo)}
                disabled={isQuantityAsset}
                onChange={(event) => setField("serialNo", event.target.value)}
                placeholder={isQuantityAsset ? "Not used for quantity assets" : "SN-XXXX-XXXX"}
                required={!isQuantityAsset}
                value={isQuantityAsset ? "" : form.serialNo}
              />
            </Field>
            <Field error={fieldErrors.domainCode} label="Domain" required>
              {lockDomain || !canChangeDomain ? (
                <p className="flex h-11 items-center text-sm font-semibold text-ink">
                  {selectedDomain?.name ?? form.domainCode}
                </p>
              ) : (
                <Select
                  required
                  aria-invalid={Boolean(fieldErrors.domainCode)}
                  onChange={(event) =>
                    setField("domainCode", event.target.value)
                  }
                  value={form.domainCode}
                >
                  {options.domains.map((domain) => (
                    <option key={domain.code} value={domain.code}>
                      {domain.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field error={fieldErrors.categoryName} label="Category" required>
              <Select
                required
                aria-invalid={Boolean(fieldErrors.categoryName)}
                onChange={(event) => setField("categoryName", event.target.value)}
                value={form.categoryName}
              >
                <option value="">Select category</option>
                {visibleCategories.map((category) => (
                  <option key={`${category.domainCode}-${category.name}`} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              error={fieldErrors.brand}
              label="Brand"
              required
            >
              <Input
                required
                aria-invalid={Boolean(fieldErrors.brand)}
                onChange={(event) => setField("brand", event.target.value)}
                placeholder="Enter brand (Symbols allowed: - / ( ) + .)"
                value={form.brand}
              />
            </Field>
            <Field error={fieldErrors.typeName} label="Type" required>
              <Select
                aria-invalid={Boolean(fieldErrors.typeName)}
                onChange={(event) => {
                  const nextTypeName = event.target.value;
                  const nextType = visibleTypes.find((type) => type.name === nextTypeName);
                  setForm((current) => ({
                    ...current,
                    serialNo: nextType?.trackMethod === "QUANTITY" ? "" : current.serialNo,
                    typeName: nextTypeName,
                  }));
                }}
                required
                value={form.typeName}
              >
                <option value="">Select type</option>
                {visibleTypes.map((type) => (
                  <option key={`${type.domainCode}-${type.name}`} value={type.name}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              error={fieldErrors.partNo}
              label="Part No."
              required
            >
              <Input
                required
                aria-invalid={Boolean(fieldErrors.partNo)}
                onChange={(event) => setField("partNo", event.target.value)}
                placeholder="Enter part no. (Symbols allowed: - / .)"
                value={form.partNo}
              />
            </Field>
          </div>
        </section>
      </section>

      <section className="rounded-md border border-border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-navy">Operational State</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field error={fieldErrors.status} label="Current Status" required>
            <Select
              onChange={(event) =>
                setField("status", event.target.value as AssetStatus)
              }
              required
              aria-invalid={Boolean(fieldErrors.status)}
              value={form.status}
            >
              {options.statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            error={fieldErrors.location}
            label="Location"
            required
          >
            <Input
              required
              aria-invalid={Boolean(fieldErrors.location)}
              onChange={(event) => setField("location", event.target.value)}
              placeholder="Enter location (Symbols allowed: space - . / ,)"
              value={form.location}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Description">
            <Textarea
              onChange={(event) => setField("description", event.target.value)}
              value={form.description}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Remark">
            <Textarea
              onChange={(event) => setField("note", event.target.value)}
              value={form.note}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}











