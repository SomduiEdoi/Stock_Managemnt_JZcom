"use client";

import { AssetStatus } from "@prisma/client";
import { AssetTrackMethod, getEffectiveAssetTrackMethod } from "@/lib/asset-tracking";
import { AssetImagePreview } from "@/components/assets/asset-image-preview";
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
import { CreatableDropdown } from "@/components/form/creatable-dropdown";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import { formatWarehouseName } from "@/lib/display-labels";

type AssetEditFormProps = {
  canChangeWarehouse: boolean;
  initialWarehouseCode?: string;
  lockWarehouse?: boolean;
  mode: "create" | "edit";
  options: AssetEditOptions;
} & (
  | {
      asset: AssetEditRecord;
      mode: "edit";
    }
  | {
      asset?: never;
      template?: AssetEditRecord;
      mode: "create";
    }
);

type AssetEditFormState = {
  brand: string;
  categoryName: string;
  customFields: Record<string, string>;
  description: string;
  warehouseCode: string;
  imageRef: string;
  location: string;
  modelName: string;
  modelNo: string;
  modelTrackMethod: AssetTrackMethod | null;
  note: string;
  partNo: string;
  quantity: string;
  serialNo: string;
  status: AssetStatus;
  typeName: string;
};

type AssetEditFieldKey =
  | "brand"
  | "categoryName"
  | "warehouseCode"
  | "location"
  | "modelName"
  | "partNo"
  | "quantity"
  | "serialNo"
  | "status"
  | "typeName";

type AssetEditFieldErrors = Partial<Record<AssetEditFieldKey | `custom:${string}`, string>>;

function warehouseHref(code: string) {
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
  options: { allowed: string; max: number; min: number; optional?: boolean; pattern: RegExp },
) {
  const trimmed = value.trim();

  if (!trimmed) {
    if (options.optional) {
      return null;
    }

    return `${label} is required.`;
  }

  if (options.optional && trimmed === "-") {
    return null;
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
  trackMethod: AssetTrackMethod,
  customFields: AssetEditOptions["categories"][number]["customFields"],
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
    optional: true,
    pattern: /^[A-Za-z0-9\-\/.]+$/,
  });

  if (modelError) fieldErrors.modelName = modelError;
  if (brandError) fieldErrors.brand = brandError;
  if (locationError) fieldErrors.location = locationError;
  if (partNoError) fieldErrors.partNo = partNoError;

  if (trackMethod === "SERIAL") {
    const serialNo = form.serialNo.trim();

    if (!serialNo) {
      fieldErrors.serialNo = "Serial no. is required for this model.";
    } else if (!isAscii(serialNo)) {
      fieldErrors.serialNo = "Serial no. must not contain Thai characters. English only.";
    } else if (serialNo && !/^[A-Za-z0-9-]+$/.test(serialNo)) {
      fieldErrors.serialNo = "Serial no. allows letters, numbers, and - only. No spaces or other symbols.";
    }
  } else {
    const quantity = Number.parseInt(form.quantity, 10);

    if (!form.quantity.trim()) {
      fieldErrors.quantity = "Quantity is required.";
    } else if (!Number.isInteger(Number(form.quantity)) || quantity < 0) {
      fieldErrors.quantity = "Quantity must be a whole number greater than or equal to 0.";
    }

    if (form.serialNo.trim()) {
      fieldErrors.serialNo = "Serial no. must be empty for quantity assets.";
    }
  }

  if (!hasText(form.categoryName)) {
    fieldErrors.categoryName = "Category is required.";
  }

  if (!hasText(form.typeName)) {
    fieldErrors.typeName = "Type is required.";
  }

  if (!hasText(form.warehouseCode)) {
    fieldErrors.warehouseCode = "Warehouse is required.";
  }

  if (!hasText(form.status)) {
    fieldErrors.status = "Status is required.";
  }

  customFields.forEach((field) => {
    if (field.isRequired && !hasText(form.customFields[field.key] ?? "")) {
      fieldErrors[`custom:${field.key}`] = `${field.label} is required.`;
    }
  });

  return fieldErrors;
}
function toFormState(asset: AssetEditRecord): AssetEditFormState {
  return {
    brand: asset.assetModel.brand ?? "",
    categoryName: asset.assetModel.category?.name ?? "",
    customFields: Object.fromEntries(asset.customFieldValues.map((value) => [value.field.key, value.valueText ?? ""])),
    description: asset.assetModel.description ?? "",
    warehouseCode: asset.warehouse.code,
    imageRef: asset.imageRef ?? "",
    location: asset.location?.name ?? asset.locationText ?? "",
    modelName: asset.assetModel.name,
    modelNo: asset.assetModel.modelNo ?? "",
    modelTrackMethod: asset.assetModel.isSerialized ? AssetTrackMethod.SERIAL : AssetTrackMethod.QUANTITY,
    note: asset.note ?? "",
    partNo: asset.assetModel.partNo ?? "",
    quantity: String(asset.assetQuantity ?? 1),
    serialNo: asset.serialNo ?? "",
    status: asset.status,
    typeName: asset.assetModel.typeName ?? "",
  };
}

function createFormState(initialWarehouseCode: string): AssetEditFormState {
  return {
    brand: "",
    categoryName: "",
    customFields: {},
    description: "",
    warehouseCode: initialWarehouseCode,
    imageRef: "",
    location: "",
    modelName: "",
    modelNo: "",
    modelTrackMethod: null,
    note: "",
    partNo: "",
    quantity: "1",
    serialNo: "",
    status: AssetStatus.READY,
    typeName: "",
  };
}

function Field({
  children,
  className,
  error,
  required,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  required?: boolean;
  label: string;
}) {
  return (
    <label className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
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
        "h-11 rounded-md border bg-white px-3 text-sm font-semibold text-ink outline-none ring-brand-accent/20 placeholder:font-normal placeholder:text-gray-400 focus:ring-4",
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

export function AssetEditForm(props: AssetEditFormProps) {
  const { canChangeWarehouse, initialWarehouseCode, lockWarehouse = false, mode, options } = props;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AssetEditFieldErrors>({});
  const asset = mode === "edit" ? props.asset : null;
  const [form, setForm] = useState<AssetEditFormState>(() =>
    mode === "edit"
      ? toFormState(props.asset)
      : props.template ? { ...toFormState(props.template), quantity: "", serialNo: "", status: AssetStatus.READY, customFields: { ...toFormState(props.template).customFields, ...Object.fromEntries((options.categories.find((category) => category.name === props.template?.assetModel.category?.name)?.customFields ?? []).filter((field) => field.key.toLowerCase() === "used").map((field) => [field.key, "USED"])) } } : createFormState(initialWarehouseCode ?? "SERVER"),
  );
  const [isSaving, setIsSaving] = useState(false);

  function setField<Key extends keyof AssetEditFormState>(
    key: Key,
    value: AssetEditFormState[Key],
  ) {
    const modelIdentityField = ["warehouseCode", "categoryName", "typeName", "brand", "modelName", "modelNo", "partNo", "description"].includes(key);
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(modelIdentityField ? { modelTrackMethod: null } : {}),
    }));
  }

  function setAssetTrackingMethod(nextTrackMethod: AssetTrackMethod) {
    setForm((current) => ({
      ...current,
      quantity: current.quantity || "1",
      serialNo: nextTrackMethod === AssetTrackMethod.QUANTITY ? "" : current.serialNo,
      modelTrackMethod: nextTrackMethod,
    }));
    setFieldErrors((current) => ({ ...current, quantity: undefined, serialNo: undefined }));
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

    const nextFieldErrors = validateAssetForm(form, trackMethod, selectedCategory?.customFields ?? []);
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
          customFields: form.customFields,
          categoryName: form.categoryName,
          description: form.description,
          warehouseCode: form.warehouseCode,
          imageRef: form.imageRef || null,
          locationCode: null,
          locationName: form.location,
          locationText: form.location,
          modelName: form.modelName,
          modelNo: mode === "create" ? selectedAssetModel?.modelNo ?? null : form.modelNo,
          modelTrackMethod,
          note: form.note,
          partNo: form.partNo,
          quantity: isQuantityAsset ? Number.parseInt(form.quantity, 10) : null,
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
    (category) => category.warehouseCode === form.warehouseCode,
  );
  const selectedCategory = visibleCategories.find((category) => category.name === form.categoryName) ?? null;
  const categoryCustomFields = selectedCategory?.customFields ?? [];

  function setCustomField(key: string, value: string) {
    setForm((current) => ({
      ...current,
      customFields: { ...current.customFields, [key]: value },
    }));
  }
  const selectedWarehouse =
    options.warehouses.find((warehouse) => warehouse.code === form.warehouseCode) ??
    options.warehouses[0] ??
    null;
  const visibleTypes = options.types.filter((type) => {
    if (type.warehouseCode !== form.warehouseCode) return false;
    if (!form.categoryName) return true;
    return type.categoryName === form.categoryName;
  });
  const selectedAssetModel = options.models.find((model) =>
    model.warehouseCode === form.warehouseCode &&
    model.categoryName === (form.categoryName || null) &&
    model.typeName === (form.typeName || null) &&
    model.brand === (form.brand || null) &&
    (mode === "create" || model.modelNo === (form.modelNo || null)) &&
    model.partNo === (form.partNo || null) &&
    model.name === form.modelName
  );
  const modelTrackMethod = selectedAssetModel
    ? selectedAssetModel.isSerialized ? AssetTrackMethod.SERIAL : AssetTrackMethod.QUANTITY
    : form.modelTrackMethod ?? AssetTrackMethod.SERIAL;
  const trackMethod = getEffectiveAssetTrackMethod({
    assetModel: { isSerialized: modelTrackMethod === AssetTrackMethod.SERIAL },
    serialNo: form.serialNo,
  });
  const isQuantityAsset = trackMethod === "QUANTITY";
  const saveUrl = mode === "edit" && asset ? `/api/assets/${asset.id}` : "/api/assets";
  const cancelHref =
    mode === "edit" && asset ? `/dashboard/assets/${asset.id}` : warehouseHref(form.warehouseCode);
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
            <Link className="text-navy hover:underline" href={warehouseHref(form.warehouseCode)}>
              {formatWarehouseName(selectedWarehouse?.name ?? form.warehouseCode)}
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
              <AssetImagePreview src={form.imageRef} alt={form.modelName} className="aspect-square w-full" sizes="(min-width: 1280px) 320px, 100vw" />
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
            <Field className="md:col-span-2" error={fieldErrors.modelName} label="Asset Name/Model" required>
              <Input
                required
                aria-invalid={Boolean(fieldErrors.modelName)}
                onChange={(event) => setField("modelName", event.target.value)}
                placeholder="Enter model name (Symbols allowed: - / ( ) + .)"
                value={form.modelName}
              />
            </Field>
            <Field error={fieldErrors.categoryName} label="Category" required>
              <SearchableDropdown
                onChange={(categoryName) => {
                  setForm((current) => ({
                    ...current,
                    categoryName,
                    customFields: {},
                    modelTrackMethod: null,
                    typeName: options.types.some(
                      (type) =>
                        type.warehouseCode === current.warehouseCode &&
                        type.categoryName === categoryName &&
                        type.name === current.typeName,
                    )
                      ? current.typeName
                      : "",
                  }));
                }}
                options={visibleCategories.map((category) => ({
                  label: category.name,
                  searchText: `${category.warehouseCode} ${category.name}`,
                  value: category.name,
                }))}
                placeholder="Select category"
                searchPlaceholder="Search category"
                value={form.categoryName}
              />
            </Field>
            <Field error={fieldErrors.typeName} label="Type" required>
              <SearchableDropdown
                onChange={(nextTypeName) => {
                  const nextType = visibleTypes.find((type) => type.name === nextTypeName);
                  setForm((current) => ({
                    ...current,
                    categoryName: nextType?.categoryName ?? current.categoryName,
                    modelTrackMethod: null,
                    typeName: nextTypeName,
                  }));
                }}
                options={visibleTypes.map((type) => ({
                  description: type.categoryName,
                  label: type.name,
                  searchText: `${type.warehouseCode} ${type.categoryName} ${type.name}`,
                  value: type.name,
                }))}
                placeholder="Select type"
                searchPlaceholder="Search type"
                value={form.typeName}
              />
            </Field>
            <Field error={fieldErrors.brand} label="Brand" required>
              <CreatableDropdown
                required
                ariaLabel="Brand"
                error={Boolean(fieldErrors.brand)}
                onChange={(value) => setField("brand", value)}
                options={options.brands.map((brand) => ({ label: brand, value: brand }))}
                placeholder="Select or enter brand"
                searchPlaceholder="Search brand"
                value={form.brand}
              />
            </Field>
            <div className={mode === "edit" ? "grid gap-4 sm:grid-cols-2" : ""}>
              <Field error={fieldErrors.partNo} label="Part No.">
                <CreatableDropdown
                  ariaLabel="Part No."
                  error={Boolean(fieldErrors.partNo)}
                  onChange={(value) => setField("partNo", value)}
                  options={options.partNos.map((partNo) => ({ label: partNo, value: partNo }))}
                  placeholder="Select or enter part no."
                  searchPlaceholder="Search part no."
                  value={form.partNo}
                />
              </Field>
              {mode === "edit" ? (
                <Field label="Model No.">
                  <Input
                    onChange={(event) => setField("modelNo", event.target.value)}
                    value={form.modelNo}
                  />
                </Field>
              ) : null}
            </div>
            <Field label="Tracking Method" required>
              <SearchableDropdown
                disabled={Boolean(selectedAssetModel)}
                onChange={(value) => setAssetTrackingMethod(value as AssetTrackMethod)}
                options={[
                  { label: "Serialized", value: AssetTrackMethod.SERIAL },
                  { label: "Quantity Pool", value: AssetTrackMethod.QUANTITY },
                ]}
                placeholder="Select tracking method"
                searchPlaceholder="Search tracking method"
                value={modelTrackMethod}
              />
            </Field>
            {modelTrackMethod === AssetTrackMethod.SERIAL ? (
              <Field error={fieldErrors.serialNo} label="Serial Number">
                <Input
                  aria-invalid={Boolean(fieldErrors.serialNo)}
                  onChange={(event) => setField("serialNo", event.target.value)}
                  placeholder="SN-XXXX-XXXX"
                  type="text"
                  value={form.serialNo}
                />
              </Field>
            ) : null}
            {isQuantityAsset ? (
              <Field error={fieldErrors.quantity} label="Quantity" required>
                <Input
                  aria-invalid={Boolean(fieldErrors.quantity)}
                  min={0}
                  onChange={(event) => setField("quantity", event.target.value)}
                  placeholder="Enter quantity"
                  required
                  type="number"
                  value={form.quantity}
                />
              </Field>
            ) : null}
            <Field className="md:col-span-2" error={fieldErrors.warehouseCode} label="Warehouse" required>
              {mode === "create" || lockWarehouse || !canChangeWarehouse ? (
                <p className="flex h-11 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-ink">
                  {formatWarehouseName(selectedWarehouse?.name ?? form.warehouseCode)}
                </p>
              ) : (
                <SearchableDropdown
                  onChange={(value) => setField("warehouseCode", value)}
                  options={options.warehouses.map((warehouse) => ({
                    label: warehouse.name,
                    searchText: `${warehouse.name} ${warehouse.code}`,
                    value: warehouse.code,
                  }))}
                  placeholder="Select warehouse"
                  searchPlaceholder="Search warehouse"
                  value={form.warehouseCode}
                />
              )}
            </Field>

            {categoryCustomFields.map((field) => {
              const errorKey = `custom:${field.key}` as const;
              const value = form.customFields[field.key] ?? "";

              return (
                <Field error={fieldErrors[errorKey]} key={field.id} label={field.label} required={field.isRequired}>
                  {field.dataType === "DROPDOWN" ? (
                    <SearchableDropdown
                      onChange={(nextValue) => setCustomField(field.key, nextValue)}
                      options={field.options.map((option) => ({ label: option, value: option }))}
                      placeholder={field.placeholder ?? "Select " + field.label}
                      searchPlaceholder={"Search " + field.label}
                      value={value}
                    />
                  ) : field.dataType === "BOOLEAN" ? (
                    <label className="inline-flex h-11 items-center gap-3 rounded-md border border-border bg-white px-3 text-sm font-semibold text-ink">
                      <input
                        checked={value === "true"}
                        onChange={(event) => setCustomField(field.key, event.target.checked ? "true" : "false")}
                        type="checkbox"
                      />
                      Enabled
                    </label>
                  ) : (
                    <Input
                      aria-invalid={Boolean(fieldErrors[errorKey])}
                      onChange={(event) => setCustomField(field.key, event.target.value)}
                      placeholder={field.placeholder ?? (field.unit ? "Enter " + field.label + " (" + field.unit + ")" : "Enter " + field.label)}
                      type={field.dataType === "NUMBER" ? "number" : "text"}
                      value={value}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </section>
      </section>

      <section className="rounded-md border border-border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-navy">Operational State</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field error={fieldErrors.status} label="Current Status" required>
            <SearchableDropdown
              onChange={(value) => setField("status", value as AssetStatus)}
              options={options.statuses.map((status) => ({ label: status, value: status }))}
              placeholder="Select status"
              searchPlaceholder="Search status"
              value={form.status}
            />
          </Field>
          <Field
            error={fieldErrors.location}
            label="Location"
            required
          >
            <CreatableDropdown
              required
              ariaLabel="Location"
              error={Boolean(fieldErrors.location)}
              onChange={(value) => setField("location", value)}
              options={options.locations.map((location) => ({
                description: location.code ?? undefined,
                label: location.name,
                searchText: location.code ?? undefined,
                value: location.name,
              }))}
              placeholder="Select or enter location"
              searchPlaceholder="Search location"
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












