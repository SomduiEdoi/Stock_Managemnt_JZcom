"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  Filter,
  Mail,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  buildUserManagementHref,
  organizationLevelOptions,
  organizationTagLabel,
  organizationUnitOptions,
  stockControllerTagOptions,
  type UserManagementFilters,
  type UserManagementMetrics,
  type UserManagementRow,
  type UserSystemRole,
  userRoleOptions,
} from "@/lib/user-management-shared";
import { SearchCombobox } from "@/components/form/search-combobox";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import { UserActionMenu } from "@/features/user-management/user-action-menu";
import { TablePagination } from "@/components/table/table-pagination";

type UserManagementPageProps = {
  filters: UserManagementFilters;
  metrics: UserManagementMetrics;
  total: number;
  totalPages: number;
  users: UserManagementRow[];
};

type UserFormState = {
  email: string;
  ldapUsername: string;
  name: string;
  organizationAssignments: Array<{
    organizationLevel: string;
    organizationTag: string;
  }>;
  primaryOrganizationTag: string;
  organizationLevel: string;
  organizationTag: string;
  role: UserSystemRole | "";
  stockControllerTag: string;
};

type DialogMode =
  | { type: "ADD" }
  | { type: "DELETE"; user: UserManagementRow }
  | { type: "EDIT"; user: UserManagementRow }
  | { type: "UNLINK_LDAP"; user: UserManagementRow }
  | { type: "STATUS"; user: UserManagementRow };

const roleLabels: Record<UserSystemRole, string> = {
  ADMIN: "Admin",
  STOCK_CONTROLLER: "Stock Controller",
  USER: "User",
};

const stockControllerTagLabels = {
  HEAD_STOCK_CONTROLLER: "Head Stock Controller",
  STOCK_CONTROLLER: "Stock Controller",
} as const;

const projectLabels = {
  LEAD_PROJECT: "Lead Project",
  TEAM_MEMBER: "Team Member",
} as const;

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getUserInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function emptyFormState(): UserFormState {
  return {
    email: "",
    ldapUsername: "",
    name: "",
    organizationAssignments: [{ organizationLevel: "", organizationTag: "" }],
    primaryOrganizationTag: "",
    organizationLevel: "",
    organizationTag: "",
    role: "",
    stockControllerTag: "",
  };
}

function toFormState(user: UserManagementRow): UserFormState {
  return {
    email: user.email,
    ldapUsername: user.ldapUsername ?? "",
    name: user.name,
    organizationAssignments:
      user.organizationAssignments.length > 0
        ? user.organizationAssignments.map((assignment) => ({
            organizationLevel: assignment.organizationLevel,
            organizationTag: assignment.organizationTag,
          }))
        : [{ organizationLevel: user.organizationLevel ?? "", organizationTag: user.organizationTag ?? "" }],
    primaryOrganizationTag:
      user.organizationAssignments.find((assignment) => assignment.isPrimary)?.organizationTag ??
      user.organizationAssignments[0]?.organizationTag ??
      user.organizationTag ??
      "",
    organizationLevel: user.organizationLevel ?? "",
    organizationTag: user.organizationTag ?? "",
    role: user.systemRole,
    stockControllerTag: user.stockControllerTag ?? "",
  };
}

function roleTone(role: UserSystemRole) {
  if (role === "ADMIN") {
    return "bg-navy text-white";
  }

  if (role === "STOCK_CONTROLLER") {
    return "bg-brand-accent/15 text-brand-accent";
  }

  return "bg-status-borrow/15 text-status-borrow";
}

function tagPills(user: UserManagementRow) {
  if (user.systemRole === "ADMIN") {
    return [];
  }

  if (user.systemRole === "STOCK_CONTROLLER") {
    const values: string[] = user.stockControllerTag
      ? [stockControllerTagLabels[user.stockControllerTag]]
      : [];

    return values.concat(
      user.warehousePermissions
        .filter((permission) => permission.canManage)
        .map((permission) => permission.warehouse.name),
    );
  }

  const values: string[] = user.organizationAssignments.map(
    (assignment) =>
      `${assignment.organizationLevel} / ${organizationTagLabel(assignment.organizationTag)}`,
  );
  if (user.projectTag) {
    values.push(projectLabels[user.projectTag]);
  }

  return values;
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-md border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-4 text-3xl font-bold leading-none text-ink">
            {value.toLocaleString("en-US")}
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-navy">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold text-brand-accent">{detail}</p>
    </article>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
      <span
        className={`h-2 w-2 rounded-full ${
          isActive ? "bg-status-ready" : "bg-status-fail"
        }`}
      />
      {isActive ? "Active" : "Blocked"}
    </span>
  );
}

function Field({
  children,
  label,
  required = false,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-navy">
        {label}
        {required ? <span className="ml-1 text-status-fail">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function roleOptions() {
  return userRoleOptions.map((role) => ({ label: roleLabels[role], value: role }));
}

function stockControllerOptions() {
  return stockControllerTagOptions.map((option) => ({
    label: stockControllerTagLabels[option],
    searchText: `${stockControllerTagLabels[option]} ${option}`,
    value: option,
  }));
}

function organizationLevelDropdownOptions() {
  return organizationLevelOptions.map((option) => ({ label: option, value: option }));
}

function organizationUnitDropdownOptions() {
  return organizationUnitOptions.map((option) => ({
    description: option.group,
    label: option.value,
    searchText: `${option.group} ${option.value}`,
    value: option.value,
  }));
}

function baseInputClass(disabled = false) {
  return `h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-medium text-ink outline-none ring-brand-accent/20 transition focus:ring-4 ${
    disabled ? "cursor-not-allowed bg-surface text-muted-foreground" : ""
  }`;
}

function cleanOrganizationAssignments(form: UserFormState) {
  return form.organizationAssignments.filter(
    (assignment) => assignment.organizationLevel && assignment.organizationTag,
  );
}

function OrganizationAssignmentsField({
  disabled,
  form,
  setForm,
}: {
  disabled: boolean;
  form: UserFormState;
  setForm: Dispatch<SetStateAction<UserFormState>>;
}) {
  function updateAssignment(
    index: number,
    key: "organizationLevel" | "organizationTag",
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      organizationAssignments: current.organizationAssignments.map((assignment, assignmentIndex) =>
        assignmentIndex === index ? { ...assignment, [key]: value } : assignment,
      ),
    }));
  }

  function addAssignment() {
    setForm((current) => ({
      ...current,
      organizationAssignments: [
        ...current.organizationAssignments,
        { organizationLevel: "", organizationTag: "" },
      ],
    }));
  }

  function removeAssignment(index: number) {
    setForm((current) => ({
      ...current,
      organizationAssignments:
        current.organizationAssignments.length === 1
          ? [{ organizationLevel: "", organizationTag: "" }]
          : current.organizationAssignments.filter((_, assignmentIndex) => assignmentIndex !== index),
      primaryOrganizationTag:
        current.organizationAssignments[index]?.organizationTag === current.primaryOrganizationTag
          ? current.organizationAssignments.find((_, assignmentIndex) => assignmentIndex !== index)?.organizationTag ?? ""
          : current.primaryOrganizationTag,
    }));
  }

  return (
    <div className="md:col-span-2">
      <span className="mb-2 block text-sm font-bold text-navy">
        Organization Assignments
        {!disabled ? <span className="ml-1 text-status-fail">*</span> : null}
      </span>
      <div className="space-y-3">
        {form.organizationAssignments.map((assignment, index) => (
          <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr_auto]" key={index}>
            <label className="flex h-11 items-center gap-2 whitespace-nowrap text-sm font-semibold text-navy">
              <input
                checked={form.primaryOrganizationTag === assignment.organizationTag && Boolean(assignment.organizationTag)}
                className="h-4 w-4 accent-brand-accent"
                disabled={disabled || !assignment.organizationTag}
                onChange={() =>
                  setForm((current) => ({
                    ...current,
                    primaryOrganizationTag: assignment.organizationTag,
                  }))
                }
                type="radio"
              />
              Primary
            </label>
            <SearchableDropdown
              disabled={disabled}
              onChange={(value) => updateAssignment(index, "organizationLevel", value)}
              options={organizationLevelDropdownOptions()}
              placeholder={disabled ? "Disabled" : "Select Organization Level"}
              searchPlaceholder="Search organization level"
              value={disabled ? "" : assignment.organizationLevel}
            />
            <SearchableDropdown
              disabled={disabled}
              onChange={(value) => updateAssignment(index, "organizationTag", value)}
              options={organizationUnitDropdownOptions()}
              placeholder={disabled ? "Disabled" : "Select Unit / Team Tag"}
              searchPlaceholder="Search unit or team tag"
              value={disabled ? "" : assignment.organizationTag}
            />
            <button
              className="h-11 rounded-md border border-border px-3 text-sm font-bold text-status-fail hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || form.organizationAssignments.length === 1}
              onClick={() => removeAssignment(index)}
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        className="mt-3 h-10 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={addAssignment}
        type="button"
      >
        Add Assignment
      </button>
      {!disabled ? (
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          Select one assignment as the primary request context. This is used as the default approval context.
        </p>
      ) : null}
    </div>
  );
}

function ModalShell({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-2xl overflow-visible rounded-md border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-bold text-navy">{title}</h2>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function UserFormModal({
  initialState,
  mode,
  onClose,
  onSaved,
}: {
  initialState: UserFormState;
  mode: "ADD" | "EDIT";
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<UserFormState>(initialState);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);


  function setField<Key extends keyof UserFormState>(key: Key, value: UserFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    if (!form.email.trim()) {
      return "Email is required.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Email must be a valid email address.";
    }

    if (!form.name.trim()) {
      return "Name is required.";
    }

    if (!form.ldapUsername.trim()) {
      return "AD username is required.";
    }

    if (!form.role) {
      return "Role is required.";
    }

    if (form.role === "STOCK_CONTROLLER" && !form.stockControllerTag) {
      return "Stock controller tag is required for Stock Controller.";
    }

    if (form.role === "USER" && cleanOrganizationAssignments(form).length === 0) {
      return "At least one organization assignment is required for User.";
    }

    if (
      form.role === "USER" &&
      !cleanOrganizationAssignments(form).some(
        (assignment) => assignment.organizationTag === form.primaryOrganizationTag,
      )
    ) {
      return "Select one primary organization assignment.";
    }

    return "";
  }

  async function handleSubmit() {
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }

    setError("");
    setIsSubmitting(true);

    const payload = {
      email: form.email.trim(),
      ldapUsername: form.ldapUsername.trim(),
      name: form.name.trim(),
      organizationAssignments:
        form.role === "USER" ? cleanOrganizationAssignments(form) : [],
      primaryOrganizationTag:
        form.role === "USER" ? form.primaryOrganizationTag : null,
      role: form.role,
      stockControllerTag: form.role === "STOCK_CONTROLLER" ? form.stockControllerTag : null,
    };

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Unable to save user.");
        setIsSubmitting(false);
        return;
      }

      router.refresh();
      onSaved(
        mode === "ADD"
          ? "User created successfully. AD login is ready after the account is enabled."
          : "User updated successfully.",
      );
    } catch {
      setError("Unable to save user right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      title={mode === "ADD" ? "Add User" : "Edit User"}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Email" required>
          <input
            className={baseInputClass(mode === "EDIT")}
            disabled={mode === "EDIT"}
            onChange={(event) => setField("email", event.target.value)}
            type="email"
            value={form.email}
          />
        </Field>

        <Field label="Name" required>
          <input
            className={baseInputClass()}
            onChange={(event) => setField("name", event.target.value)}
            type="text"
            value={form.name}
          />
        </Field>

        <Field label="AD Username" required>
          <input
            className={baseInputClass()}
            onChange={(event) => setField("ldapUsername", event.target.value)}
            placeholder="it01 or DOMAIN\\it01"
            type="text"
            value={form.ldapUsername}
          />
        </Field>

        <Field label="Role" required>
          <SearchableDropdown
            onChange={(value) => {
              const role = value as UserSystemRole | "";
              setForm((current) => ({
                ...current,
                organizationLevel: "",
                organizationAssignments: [{ organizationLevel: "", organizationTag: "" }],
                organizationTag: "",
                role,
                stockControllerTag: "",
              }));
            }}
            options={roleOptions()}
            placeholder="Select Role"
            searchPlaceholder="Search role"
            value={form.role}
          />
        </Field>

        <Field label="Stock Controller Tag" required={form.role === "STOCK_CONTROLLER"}>
          <SearchableDropdown
            disabled={form.role !== "STOCK_CONTROLLER"}
            onChange={(value) => setField("stockControllerTag", value)}
            options={stockControllerOptions()}
            placeholder={form.role === "STOCK_CONTROLLER" ? "Select Stock Controller Tag" : "Disabled"}
            searchPlaceholder="Search stock controller tag"
            value={form.role === "STOCK_CONTROLLER" ? form.stockControllerTag : ""}
          />
        </Field>

        <OrganizationAssignmentsField
          disabled={form.role !== "USER"}
          form={form}
          setForm={setForm}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-status-fail/20 bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-11 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={handleSubmit}
          type="button"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function ConfirmModal({
  actionLabel,
  description,
  onClose,
  onConfirm,
  title,
}: {
  actionLabel: string;
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
}) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setError("");
    setIsSubmitting(true);

    try {
      await onConfirm();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to complete action.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title={title}>
      <p className="text-sm font-medium leading-6 text-ink">{description}</p>
      {error ? (
        <div className="mt-4 rounded-md border border-status-fail/20 bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
          {error}
        </div>
      ) : null}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-11 rounded-md bg-status-fail px-4 text-sm font-bold text-white hover:bg-status-fail/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={handleConfirm}
          type="button"
        >
          {isSubmitting ? "Working..." : actionLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function ManagementDialogs({
  dialog,
  onClose,
  onSaved,
}: {
  dialog: DialogMode | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();

  if (!dialog) {
    return null;
  }

  if (dialog.type === "ADD") {
    return (
      <UserFormModal
        initialState={emptyFormState()}
        mode="ADD"
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  if (dialog.type === "EDIT") {
    return (
      <EditUserModal
        onClose={onClose}
        onSaved={onSaved}
        user={dialog.user}
      />
    );
  }

  if (dialog.type === "DELETE") {
    return (
      <ConfirmModal
        actionLabel="Delete User"
        description={`Are you sure you want to delete ${dialog.user.name}?`}
        onClose={onClose}
        onConfirm={async () => {
          const response = await fetch(`/api/users/${dialog.user.id}`, {
            method: "DELETE",
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message ?? "Unable to delete user.");
          }
          router.refresh();
          onSaved("User deleted successfully.");
        }}
        title="Delete User"
      />
    );
  }

  if (dialog.type === "UNLINK_LDAP") {
    return (
      <ConfirmModal
        actionLabel="Unlink AD"
        description={`Remove the AD mapping from ${dialog.user.name}? The Stock user and role will be kept.`}
        onClose={onClose}
        onConfirm={async () => {
          const response = await fetch(`/api/users/${dialog.user.id}`, {
            body: JSON.stringify({ unlinkLdap: true }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message ?? "Unable to unlink AD account.");
          }
          router.refresh();
          onSaved("AD account unlinked successfully.");
        }}
        title="Unlink AD Account"
      />
    );
  }

  return (
    <ConfirmModal
      actionLabel={dialog.user.isActive ? "Block User" : "Unblock User"}
      description={`Are you sure you want to ${
        dialog.user.isActive ? "block" : "unblock"
      } ${dialog.user.name}?`}
      onClose={onClose}
      onConfirm={async () => {
        const response = await fetch(`/api/users/${dialog.user.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !dialog.user.isActive }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message ?? "Unable to update status.");
        }
        router.refresh();
        onSaved(
          dialog.user.isActive
            ? "User blocked successfully."
            : "User unblocked successfully.",
        );
      }}
      title={dialog.user.isActive ? "Block User" : "Unblock User"}
    />
  );
}

function EditUserModal({
  onClose,
  onSaved,
  user,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
  user: UserManagementRow;
}) {
  const router = useRouter();
  const [form, setForm] = useState<UserFormState>(toFormState(user));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<Key extends keyof UserFormState>(key: Key, value: UserFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }


  function validate() {
    if (!form.name.trim()) {
      return "Name is required.";
    }

    if (!form.ldapUsername.trim()) {
      return "AD username is required.";
    }

    if (!form.role) {
      return "Role is required.";
    }

    if (form.role === "STOCK_CONTROLLER" && !form.stockControllerTag) {
      return "Stock controller tag is required for Stock Controller.";
    }

    if (form.role === "USER" && cleanOrganizationAssignments(form).length === 0) {
      return "At least one organization assignment is required for User.";
    }

    if (
      form.role === "USER" &&
      !cleanOrganizationAssignments(form).some(
        (assignment) => assignment.organizationTag === form.primaryOrganizationTag,
      )
    ) {
      return "Select one primary organization assignment.";
    }

    return "";
  }

  async function handleSubmit() {
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ldapUsername: form.ldapUsername.trim(),
          name: form.name.trim(),
          organizationAssignments:
            form.role === "USER" ? cleanOrganizationAssignments(form) : [],
          primaryOrganizationTag:
            form.role === "USER" ? form.primaryOrganizationTag : null,
          role: form.role,
          stockControllerTag: form.role === "STOCK_CONTROLLER" ? form.stockControllerTag : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Unable to update user.");
        setIsSubmitting(false);
        return;
      }

      router.refresh();
      onSaved("User updated successfully.");
    } catch {
      setError("Unable to update user right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Edit User">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Email" required>
          <input className={baseInputClass(true)} disabled type="email" value={form.email} />
        </Field>

        <Field label="Name" required>
          <input
            className={baseInputClass()}
            onChange={(event) => setField("name", event.target.value)}
            type="text"
            value={form.name}
          />
        </Field>

        <Field label="AD Username" required>
          <input
            className={baseInputClass()}
            onChange={(event) => setField("ldapUsername", event.target.value)}
            placeholder="it01 or DOMAIN\\it01"
            type="text"
            value={form.ldapUsername}
          />
        </Field>

        <Field label="Role" required>
          <SearchableDropdown
            onChange={(value) => {
              const role = value as UserSystemRole | "";
              setForm((current) => ({
                ...current,
                organizationLevel: "",
                organizationAssignments: [{ organizationLevel: "", organizationTag: "" }],
                organizationTag: "",
                role,
                stockControllerTag: "",
              }));
            }}
            options={roleOptions()}
            placeholder="Select Role"
            searchPlaceholder="Search role"
            value={form.role}
          />
        </Field>

        <Field label="Stock Controller Tag" required={form.role === "STOCK_CONTROLLER"}>
          <SearchableDropdown
            disabled={form.role !== "STOCK_CONTROLLER"}
            onChange={(value) => setField("stockControllerTag", value)}
            options={stockControllerOptions()}
            placeholder={form.role === "STOCK_CONTROLLER" ? "Select Stock Controller Tag" : "Disabled"}
            searchPlaceholder="Search stock controller tag"
            value={form.role === "STOCK_CONTROLLER" ? form.stockControllerTag : ""}
          />
        </Field>

        <OrganizationAssignmentsField
          disabled={form.role !== "USER"}
          form={form}
          setForm={setForm}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-status-fail/20 bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-11 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={handleSubmit}
          type="button"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function DetailSection({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            className="rounded-md bg-white px-3 py-1.5 text-sm font-bold text-navy shadow-sm"
            key={value}
          >
            {value}
          </span>
        ))}
      </div>
    </section>
  );
}

function UserDetailModal({
  onClose,
  user,
}: {
  onClose: () => void;
  user: UserManagementRow;
}) {
  const organizationValues =
    user.organizationAssignments.length > 0
      ? user.organizationAssignments.map(
          (assignment) =>
            `${assignment.organizationLevel} / ${organizationTagLabel(
              assignment.organizationTag,
            )}${assignment.isPrimary ? " (Primary)" : ""}`,
        )
      : user.organizationLevel && user.organizationTag
        ? [`${user.organizationLevel} / ${organizationTagLabel(user.organizationTag)}`]
        : [];
  const projectValues = user.projectTag ? [projectLabels[user.projectTag]] : [];
  const controllerValues = user.stockControllerTag
    ? [stockControllerTagLabels[user.stockControllerTag]]
    : [];
  const warehouseValues = user.warehousePermissions.map((permission) => {
    const access = permission.canManage ? "Manage" : permission.canView ? "View" : "No access";
    return `${permission.warehouse.name} (${access})`;
  });

  return (
    <ModalShell onClose={onClose} title="User Detail">
      <div className="flex items-start gap-4 rounded-md border border-border bg-surface p-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-navy text-lg font-bold text-white">
          {getUserInitials(user.name)}
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-navy">{user.name}</h3>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{user.email}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${roleTone(user.systemRole)}`}>
              {roleLabels[user.systemRole]}
            </span>
            <StatusBadge isActive={user.isActive} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <DetailSection label="Organization Assignments" values={organizationValues} />
        <DetailSection label="Project" values={projectValues} />
        <DetailSection label="Controller Tag" values={controllerValues} />
        <DetailSection label="Warehouse Permission" values={warehouseValues} />
      </div>
    </ModalShell>
  );
}

function UserTable({
  onOpenDetail,
  onOpenDialog,
  users,
}: {
  onOpenDetail: (user: UserManagementRow) => void;
  onOpenDialog: (dialog: DialogMode) => void;
  users: UserManagementRow[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-bold">Name</th>
              <th className="px-5 py-4 font-bold">Mail</th>
              <th className="px-5 py-4 font-bold">Role</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Action</th>
              <th className="px-5 py-4 font-bold">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr className="cursor-pointer align-middle hover:bg-surface/50" key={user.id} onClick={() => onOpenDetail(user)}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-sm font-bold text-white">
                      {getUserInitials(user.name)}
                    </span>
                    <div>
                      <p className="font-bold text-navy">{user.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2 font-medium text-ink">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{user.email}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${roleTone(user.systemRole)}`}
                  >
                    {roleLabels[user.systemRole]}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge isActive={user.isActive} />
                </td>
                <td className="px-5 py-4">
                  <UserActionMenu
                    hasLdapUsername={Boolean(user.ldapUsername)}
                    isActive={user.isActive}
                    onDelete={() => onOpenDialog({ type: "DELETE", user })}
                    onEdit={() => onOpenDialog({ type: "EDIT", user })}
                    onUnlink={() => onOpenDialog({ type: "UNLINK_LDAP", user })}
                    onToggleBlock={() => onOpenDialog({ type: "STATUS", user })}
                    userName={user.name}
                  />
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatDateTime(user.lastLoginAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 ? (
        <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
          No users found.
        </div>
      ) : null}
    </section>
  );
}

export function UserManagementPage({
  filters,
  metrics,
  total,
  totalPages,
  users,
}: UserManagementPageProps) {
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [detailUser, setDetailUser] = useState<UserManagementRow | null>(null);
  const [notice, setNotice] = useState("");
  const [roleFilter, setRoleFilter] = useState(filters.role);
  const [statusFilter, setStatusFilter] = useState(filters.status);

  const searchSuggestions = useMemo(() => users.flatMap((user) => [
    { category: "NAME", label: user.name, searchText: `${user.email} ${roleLabels[user.systemRole]}`, value: user.name },
    { category: "MAIL", label: user.email, searchText: user.name, value: user.email },
    { category: "ROLE", label: roleLabels[user.systemRole], searchText: `${user.name} ${user.email}`, value: roleLabels[user.systemRole] },
    ...tagPills(user).map((tag) => ({ category: "TAG", label: tag, searchText: `${user.name} ${user.email}`, value: tag })),
  ]), [users]);

  const pageLabel = useMemo(
    () => `Showing ${users.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} users`,
    [total, users.length],
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail="All system accounts"
          icon={Users}
          label="Total"
          value={metrics.total}
        />
        <MetricCard
          detail="Assigned warehouse managers"
          icon={ShieldCheck}
          label="Owner"
          value={metrics.owners}
        />
        <MetricCard
          detail="General request users"
          icon={UserCog}
          label="Staff"
          value={metrics.staff}
        />
        <MetricCard
          detail="Can currently sign in"
          icon={UserCheck}
          label="Active"
          value={metrics.active}
        />
      </section>

      <form
        action="/user"
        className="grid gap-3 rounded-md border border-border bg-white p-4 shadow-sm lg:grid-cols-[1fr_190px_170px_auto_auto]"
        method="get"
      >
        <SearchCombobox
          categories={[
            { label: "All", value: "ALL" },
            { label: "Name", value: "NAME" },
            { label: "Mail", value: "MAIL" },
            { label: "Role", value: "ROLE" },
            { label: "Tag", value: "TAG" },
          ]}
          defaultValue={filters.search}
          name="q"
          placeholder="Search name, mail, role, tag"
          suggestions={searchSuggestions}
        />

        <SearchableDropdown
          name="role"
          onChange={(value) => setRoleFilter(value as typeof roleFilter)}
          options={[{ label: "All roles", value: "ALL" }, ...roleOptions()]}
          placeholder="All roles"
          searchPlaceholder="Search role"
          value={roleFilter}
        />

        <SearchableDropdown
          name="status"
          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
          options={[
            { label: "All status", value: "ALL" },
            { label: "Active", value: "ACTIVE" },
            { label: "Blocked", value: "BLOCKED" },
          ]}
          placeholder="All status"
          searchPlaceholder="Search status"
          value={statusFilter}
        />

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface"
          type="submit"
        >
          <Filter className="h-4 w-4" />
          Filter
        </button>

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm hover:bg-navy/90"
          onClick={(event) => {
            event.preventDefault();
            setDialog({ type: "ADD" });
          }}
          type="button"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </form>

      {notice ? (
        <div className="rounded-md border border-status-ready/20 bg-status-ready/10 px-4 py-3 text-sm font-semibold text-status-ready">
          {notice}
        </div>
      ) : null}

      <UserTable onOpenDetail={setDetailUser} onOpenDialog={setDialog} users={users} />

      {detailUser ? (
        <UserDetailModal onClose={() => setDetailUser(null)} user={detailUser} />
      ) : null}

      <TablePagination
        currentPage={filters.page}
        hrefForPage={(page) => buildUserManagementHref(filters, { page })}
        summary={pageLabel}
        totalPages={totalPages}
      />

      <ManagementDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSaved={(message) => {
          setDialog(null);
          setNotice(message);
        }}
      />
    </div>
  );
}

export function UserManagementForbidden() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-navy">User Management</h1>
      <p className="mt-3 text-sm font-medium text-muted-foreground">
        Only admin users can manage system accounts.
      </p>
    </section>
  );
}

