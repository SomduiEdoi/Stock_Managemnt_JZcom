"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Filter,
  Mail,
  Search,
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
  organizationUnitOptions,
  projectTagOptions,
  type UserManagementFilters,
  type UserManagementMetrics,
  type UserManagementRow,
  type UserSystemRole,
  userRoleOptions,
} from "@/lib/user-management-shared";
import { UserActionMenu } from "@/features/user-management/user-action-menu";

type UserManagementPageProps = {
  filters: UserManagementFilters;
  metrics: UserManagementMetrics;
  total: number;
  totalPages: number;
  users: UserManagementRow[];
};

type UserFormState = {
  email: string;
  name: string;
  organizationLevel: string;
  organizationTag: string;
  role: UserSystemRole | "";
};

type DialogMode =
  | { type: "ADD" }
  | { type: "ASSIGN"; user: UserManagementRow }
  | { type: "DELETE"; user: UserManagementRow }
  | { type: "EDIT"; user: UserManagementRow }
  | { type: "STATUS"; user: UserManagementRow };

const roleLabels: Record<UserSystemRole, string> = {
  ADMIN: "Admin",
  STOCK_CONTROLLER: "Stock Controller",
  USER: "User",
};

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
    name: "",
    organizationLevel: "",
    organizationTag: "",
    role: "",
  };
}

function toFormState(user: UserManagementRow): UserFormState {
  return {
    email: user.email,
    name: user.name,
    organizationLevel: user.organizationLevel ?? "",
    organizationTag: user.organizationTag ?? "",
    role: user.systemRole,
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
    return user.domainPermissions
      .filter((permission) => permission.canManage)
      .map((permission) => permission.domain.name);
  }

  const values: string[] = [];
  if (user.organizationLevel) {
    values.push(user.organizationLevel);
  }
  if (user.organizationTag) {
    values.push(user.organizationTag);
  }
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

function baseInputClass(disabled = false) {
  return `h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-medium text-ink outline-none ring-brand-accent/20 transition focus:ring-4 ${
    disabled ? "cursor-not-allowed bg-surface text-muted-foreground" : ""
  }`;
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
      <div className="w-full max-w-2xl rounded-md border border-border bg-white shadow-xl">
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

    if (!form.role) {
      return "Role is required.";
    }

    if (form.role === "USER" && !form.organizationLevel) {
      return "Organization level is required for User.";
    }

    if (form.role === "USER" && !form.organizationTag) {
      return "Organization unit/team tag is required for User.";
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
      name: form.name.trim(),
      organizationLevel: form.role === "USER" ? form.organizationLevel : null,
      organizationTag: form.role === "USER" ? form.organizationTag : null,
      role: form.role,
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
          ? `User created successfully. Default password: ${data.user?.defaultPassword ?? "ChangeMe123!"}`
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

        <Field label="Role" required>
          <select
            className={baseInputClass()}
            onChange={(event) => {
              const role = event.target.value as UserSystemRole | "";
              setForm((current) => ({
                ...current,
                organizationLevel: "",
                organizationTag: "",
                role,
              }));
            }}
            value={form.role}
          >
            <option value="">Select Role</option>
            {userRoleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Organization Level" required={form.role === "USER"}>
          <select
            className={baseInputClass(form.role !== "USER")}
            disabled={form.role !== "USER"}
            onChange={(event) => setField("organizationLevel", event.target.value)}
            value={form.role === "USER" ? form.organizationLevel : ""}
          >
            <option value="">
              {form.role === "USER" ? "Select Organization Level" : "Disabled"}
            </option>
            {organizationLevelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Organization Unit / Team Tag" required={form.role === "USER"}>
          <select
            className={baseInputClass(form.role !== "USER")}
            disabled={form.role !== "USER"}
            onChange={(event) => setField("organizationTag", event.target.value)}
            value={form.role === "USER" ? form.organizationTag : ""}
          >
            <option value="">
              {form.role === "USER" ? "Select Unit / Team Tag" : "Disabled"}
            </option>
            {organizationUnitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.group} - {option.value}
              </option>
            ))}
          </select>
        </Field>
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

function AssignModal({
  onClose,
  onSaved,
  user,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
  user: UserManagementRow;
}) {
  const router = useRouter();
  const [projectTag, setProjectTag] = useState(user.projectTag ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSave() {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/users/${user.id}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectTag: projectTag || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Unable to update assignment.");
        setIsSubmitting(false);
        return;
      }

      router.refresh();
      onSaved("Project assignment updated successfully.");
    } catch {
      setError("Unable to update assignment right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Assign Project Tag">
      <div className="rounded-md border border-border bg-surface px-4 py-3">
        <p className="text-sm font-bold text-navy">{user.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
      </div>

      <div className="mt-4">
        <Field label="Project Tag">
          <select
            className={baseInputClass()}
            onChange={(event) => setProjectTag(event.target.value)}
            value={projectTag}
          >
            <option value="">Not assigned</option>
            {projectTagOptions.map((option) => (
              <option key={option} value={option}>
                {projectLabels[option]}
              </option>
            ))}
          </select>
        </Field>
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
          onClick={handleSave}
          type="button"
        >
          {isSubmitting ? "Saving..." : "Save"}
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

  if (dialog.type === "ASSIGN") {
    return <AssignModal onClose={onClose} onSaved={onSaved} user={dialog.user} />;
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

    if (!form.role) {
      return "Role is required.";
    }

    if (form.role === "USER" && !form.organizationLevel) {
      return "Organization level is required for User.";
    }

    if (form.role === "USER" && !form.organizationTag) {
      return "Organization unit/team tag is required for User.";
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
          name: form.name.trim(),
          organizationLevel: form.role === "USER" ? form.organizationLevel : null,
          organizationTag: form.role === "USER" ? form.organizationTag : null,
          role: form.role,
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

        <Field label="Role" required>
          <select
            className={baseInputClass()}
            onChange={(event) => {
              const role = event.target.value as UserSystemRole | "";
              setForm((current) => ({
                ...current,
                organizationLevel: "",
                organizationTag: "",
                role,
              }));
            }}
            value={form.role}
          >
            <option value="">Select Role</option>
            {userRoleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Organization Level" required={form.role === "USER"}>
          <select
            className={baseInputClass(form.role !== "USER")}
            disabled={form.role !== "USER"}
            onChange={(event) => setField("organizationLevel", event.target.value)}
            value={form.role === "USER" ? form.organizationLevel : ""}
          >
            <option value="">
              {form.role === "USER" ? "Select Organization Level" : "Disabled"}
            </option>
            {organizationLevelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Organization Unit / Team Tag" required={form.role === "USER"}>
          <select
            className={baseInputClass(form.role !== "USER")}
            disabled={form.role !== "USER"}
            onChange={(event) => setField("organizationTag", event.target.value)}
            value={form.role === "USER" ? form.organizationTag : ""}
          >
            <option value="">
              {form.role === "USER" ? "Select Unit / Team Tag" : "Disabled"}
            </option>
            {organizationUnitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.group} - {option.value}
              </option>
            ))}
          </select>
        </Field>
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

function UserTable({
  onOpenDialog,
  users,
}: {
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
              <th className="px-5 py-4 font-bold">Tag</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Action</th>
              <th className="px-5 py-4 font-bold">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr className="align-middle" key={user.id}>
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
                  <div className="flex flex-wrap gap-1.5">
                    {tagPills(user).length > 0 ? (
                      tagPills(user).map((tag) => (
                        <span
                          className="rounded-md bg-surface px-2 py-1 text-xs font-bold text-navy"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">-</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge isActive={user.isActive} />
                </td>
                <td className="px-5 py-4">
                  <UserActionMenu
                    canAssign={user.systemRole === "USER"}
                    isActive={user.isActive}
                    onAssign={() => onOpenDialog({ type: "ASSIGN", user })}
                    onDelete={() => onOpenDialog({ type: "DELETE", user })}
                    onEdit={() => onOpenDialog({ type: "EDIT", user })}
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
  const [notice, setNotice] = useState("");

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
          detail="Assigned domain managers"
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
            defaultValue={filters.search}
            name="q"
            placeholder="Search name, mail, role, tag"
          />
        </div>

        <select
          className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
          defaultValue={filters.role}
          name="role"
        >
          <option value="ALL">All roles</option>
          {userRoleOptions.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>

        <select
          className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
          defaultValue={filters.status}
          name="status"
        >
          <option value="ALL">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="BLOCKED">Blocked</option>
        </select>

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

      <UserTable onOpenDialog={setDialog} users={users} />

      <footer className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>{pageLabel}</p>
        <div className="flex gap-2">
          <Link
            aria-disabled={filters.page <= 1}
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href={buildUserManagementHref(filters, {
              page: Math.max(1, filters.page - 1),
            })}
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Link>
          <Link
            aria-disabled={filters.page >= totalPages}
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-navy px-3 font-semibold text-white aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href={buildUserManagementHref(filters, {
              page: Math.min(totalPages, filters.page + 1),
            })}
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </footer>

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

