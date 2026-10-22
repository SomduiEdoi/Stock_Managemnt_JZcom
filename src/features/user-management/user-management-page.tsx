"use client";
import { confirmDestructiveAction } from "@/components/form/confirm-destructive-action";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
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
  organizationTagLabel,
  type UserManagementFilters,
  type UserManagementMetrics,
  type UserManagementRow,
  type UserSystemRole,
  userRoleOptions,
} from "@/lib/user-management-shared";
import { SearchCombobox } from "@/components/form/search-combobox";
import { InstantFilterForm } from "@/components/form/instant-filter-form";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import { localCredentialsSchema, localUsernameSchema } from "@/lib/user-account-schema";
import { organizationAssignmentKey, organizationTeams, teamForOrganizationTag } from "@/lib/organization-team-options";
import { organizationPositionOptions, organizationLevelForPosition, organizationTagForPosition, positionForOrganizationTag, teamsForPosition } from "@/lib/organization-position-options";
import { UserActionMenu } from "@/features/user-management/user-action-menu";
import { TablePagination } from "@/components/table/table-pagination";
import { primaryOrganizationDisplay } from "@/lib/user-primary-organization";

type UserManagementPageProps = {
  filters: UserManagementFilters;
  metrics: UserManagementMetrics;
  total: number;
  totalPages: number;
  users: UserManagementRow[];
};

type UserFormState = {
  provider?: "AD" | "LOCAL";
  username?: string;
  password?: string;
  confirmPassword?: string;
  email: string;
  emailVerified: boolean;
  name: string;
  organizationAssignments: Array<{
    position?: string;
    team?: string | null;
    organizationLevel: string;
    organizationTag: string;
  }>;
  primaryOrganizationTag: string;
  primaryOrganizationKey?: string;
  organizationLevel: string;
  organizationTag: string;
  role: UserSystemRole | "";
};

type DialogMode =
  | { type: "ADD" }
  | { type: "DELETE"; user: UserManagementRow }
  | { type: "EDIT"; user: UserManagementRow }
  | { type: "STATUS"; user: UserManagementRow };

const roleLabels: Record<UserSystemRole, string> = {
  ADMIN: "Admin",
  STOREMAN: "Storeman",
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
    provider: "AD",
    username: "",
    password: "",
    confirmPassword: "",
    email: "",
    emailVerified: false,
    name: "",
    organizationAssignments: [{ organizationLevel: "", organizationTag: "" }],
    primaryOrganizationTag: "",
    organizationLevel: "",
    organizationTag: "",
    role: "",
  };
}

function toFormState(user: UserManagementRow): UserFormState {
  return {
    username: user.localUsername ?? "",
    primaryOrganizationKey: user.organizationAssignments.find((assignment) => assignment.isPrimary) ? organizationAssignmentKey(user.organizationAssignments.find((assignment) => assignment.isPrimary)!) : undefined,
    provider: user.provider ?? "AD",
    email: user.email ?? "",
    emailVerified: false,
    name: user.name,
    organizationAssignments:
      user.organizationAssignments.length > 0
        ? user.organizationAssignments.map((assignment) => ({
            team: assignment.team ?? teamForOrganizationTag(assignment.organizationTag),
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
  };
}

function roleTone(role: UserSystemRole) {
  if (role === "ADMIN") {
    return "bg-navy text-white";
  }

  if (role === "STOREMAN") {
    return "bg-brand-accent/15 text-brand-accent";
  }

  return "bg-status-borrow/15 text-status-borrow";
}

function tagPills(user: UserManagementRow) {
  if (user.systemRole === "ADMIN") {
    return [];
  }

  if (user.systemRole === "STOREMAN") {
    return user.warehousePermissions
      .filter((permission) => permission.canManage)
      .map((permission) => permission.warehouse.name);
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

function organizationLevelDropdownOptions() {
  return organizationPositionOptions.map(({ label, value }) => ({ label, value }));
}

function baseInputClass(disabled = false) {
  return `h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-medium text-ink outline-none ring-brand-accent/20 transition focus:ring-4 ${
    disabled ? "cursor-not-allowed bg-surface text-muted-foreground" : ""
  }`;
}

function AdEmailField({
  email,
  onEmailChange,
  onVerified,
  verified,
  onNameVerified,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onVerified: (value: boolean) => void;
  verified: boolean;
  onNameVerified?: (name: string) => void;
}) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function handleVerify() {
    const value = email.trim();
    setVerifyError("");
    onVerified(false);

    if (!value) {
      setVerifyError("Email is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setVerifyError("Email must be a valid email address.");
      return;
    }

    setIsVerifying(true);

    try {
      const response = await fetch("/api/users/verify-ad", {
        body: JSON.stringify({ email: value }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!active.current) return;

      if (!response.ok) {
        setVerifyError(data.message ?? "Unable to verify AD account.");
        return;
      }

      onEmailChange(data.email ?? value.toLowerCase());
      if (typeof data.name === "string") onNameVerified?.(data.name);
      onVerified(true);
    } catch {
      setVerifyError("Unable to verify AD account right now.");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="block">
      <span className="mb-2 block text-sm font-bold text-navy">
        Email<span className="ml-1 text-status-fail">*</span>
      </span>
      <div className="flex items-start gap-2">
        <input
          disabled={isVerifying}
          className={`${baseInputClass()} min-w-0 flex-1`}
          onChange={(event) => {
            onEmailChange(event.target.value);
            onVerified(false);
            setVerifyError("");
          }}
          type="email"
          value={email}
        />
        <button
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-navy px-3 text-sm font-bold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isVerifying}
          onClick={handleVerify}
          type="button"
        >
          {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isVerifying ? "Verifying..." : verified ? "Verified" : "Verify AD"}
        </button>
      </div>
      <p className={`mt-2 text-xs font-semibold ${verified ? "text-status-ready" : "text-muted-foreground"}`}>
        {verified ? "AD account verified." : "Not Linked. Verify this Email before saving."}
      </p>
      {verifyError ? <p className="mt-1 text-xs font-semibold text-status-fail">{verifyError}</p> : null}
    </div>
  );
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
    setForm((current) => {
      const previous = current.organizationAssignments[index];
      const team = key === "organizationLevel" ? previous.team ?? teamForOrganizationTag(previous.organizationTag) : value;
      const position = key === "organizationLevel" ? value : previous.position ?? positionForOrganizationTag(previous.organizationTag);
      const level = organizationLevelForPosition(position);
      const tag = organizationTagForPosition(team, position);
      const nextAssignment = { team: position && !tag ? "" : team, position, organizationLevel: level, organizationTag: tag };
      const isPrimary = current.primaryOrganizationKey
        ? current.primaryOrganizationKey === organizationAssignmentKey(previous)
        : Boolean(previous.organizationTag) && current.primaryOrganizationTag === previous.organizationTag;
      return {
        ...current,
        primaryOrganizationTag: isPrimary ? tag : current.primaryOrganizationTag,
        primaryOrganizationKey: isPrimary ? organizationAssignmentKey(nextAssignment) : current.primaryOrganizationKey,
        organizationAssignments: current.organizationAssignments.map((assignment, assignmentIndex) => assignmentIndex === index
          ? nextAssignment
          : assignment),
      };
    });
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
      primaryOrganizationKey: current.primaryOrganizationKey === organizationAssignmentKey(current.organizationAssignments[index])
        ? undefined : current.primaryOrganizationKey,
    }));
  }

  return (
    <div className="md:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-navy">
          Organization Assignments
          {!disabled ? <span className="ml-1 text-status-fail">*</span> : null}
        </span>
        <button
          className="h-10 shrink-0 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={addAssignment}
          type="button"
        >
          Add Assignment
        </button>
      </div>
      <div className="space-y-3">
        {form.organizationAssignments.map((assignment, index) => (
          <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_40px]" key={index}>
            <label className="flex h-11 items-center gap-2 whitespace-nowrap text-sm font-semibold text-navy">
              <input
                checked={Boolean(assignment.organizationTag) && (form.primaryOrganizationKey ? form.primaryOrganizationKey === organizationAssignmentKey(assignment) : form.primaryOrganizationTag === assignment.organizationTag)}
                className="h-4 w-4 accent-brand-accent"
                disabled={disabled || !assignment.organizationTag}
                onChange={() =>
                  setForm((current) => ({
                    ...current,
                    primaryOrganizationTag: assignment.organizationTag,
                    primaryOrganizationKey: organizationAssignmentKey(assignment),
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
              placeholder={disabled ? "Disabled" : "Select Position"}
              searchPlaceholder="Search position"
              value={disabled ? "" : assignment.position ?? positionForOrganizationTag(assignment.organizationTag)}
            />
            <SearchableDropdown
              disabled={disabled}
              onChange={(value) => updateAssignment(index, "organizationTag", value)}
              options={teamsForPosition(assignment.position ?? positionForOrganizationTag(assignment.organizationTag))}
              placeholder={disabled ? "Disabled" : "Select Team"}
              searchPlaceholder="Search team"
              value={disabled ? "" : assignment.team ?? teamForOrganizationTag(assignment.organizationTag)}
            />
            <button
              aria-label={`Remove organization assignment ${index + 1}`}
              className="flex h-11 w-10 shrink-0 items-center justify-center rounded-md text-navy transition hover:bg-status-fail/10 hover:text-status-fail disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || form.organizationAssignments.length === 1}
              onClick={() => removeAssignment(index)}
              title="Remove assignment"
              type="button"
            >
              <X className="h-5 w-5" strokeWidth={2.4} />
            </button>
          </div>
        ))}
      </div>
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-border bg-white shadow-xl">
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
    if (form.provider !== "LOCAL" && !form.email.trim()) {
      return "Email is required.";
    }

    if (form.provider !== "LOCAL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Email must be a valid email address.";
    }

    if (form.provider !== "LOCAL" && !form.emailVerified) {
      return "Verify the Email against Active Directory before saving.";
    }

    if (form.provider === "LOCAL") {
      const credentials = localCredentialsSchema.safeParse({ username: form.username, password: form.password, confirmPassword: form.confirmPassword });
      if (!credentials.success) return credentials.error.issues[0].message;
    }

    if (form.provider !== "LOCAL" && !form.name.trim()) {
      return "Name is required.";
    }

    if (!form.role) {
      return "Role is required.";
    }

    if (form.role === "USER" && cleanOrganizationAssignments(form).length === 0) {
      return "At least one organization assignment is required for User.";
    }

    if (
      form.role === "USER" &&
      !cleanOrganizationAssignments(form).some(
        (assignment) => form.primaryOrganizationKey ? organizationAssignmentKey(assignment) === form.primaryOrganizationKey : assignment.organizationTag === form.primaryOrganizationTag,
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
      primaryOrganizationKey: form.primaryOrganizationKey,
      provider: form.provider ?? "AD",
      ...(form.provider === "LOCAL" ? { username: form.username, password: form.password, confirmPassword: form.confirmPassword } : {}),
      ...(form.provider === "LOCAL" ? {} : { email: form.email.trim(), name: form.name.trim() }),
      organizationAssignments:
        form.role === "USER" ? cleanOrganizationAssignments(form) : [],
      primaryOrganizationTag:
        form.role === "USER" ? form.primaryOrganizationTag : null,
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
          ? "User created successfully."
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
        <fieldset className="md:col-span-2" disabled={isSubmitting}>
          <legend className="mb-2 text-sm font-bold text-navy">Account Type</legend>
          <div className="flex flex-wrap gap-5">
            {(["AD", "LOCAL"] as const).map((provider) => (
              <label className="flex items-center gap-2 text-sm" key={provider}>
                <input type="radio" name="account-provider" checked={(form.provider ?? "AD") === provider} onChange={() => { setForm((current) => ({ ...current, provider, emailVerified: false, password: "", confirmPassword: "", username: "" })); setError(""); }} />
                {provider === "AD" ? "Active Directory (AD Account)" : "Local Account"}
              </label>
            ))}
          </div>
        </fieldset>
        {form.provider === "LOCAL" ? (
          <Field label="Username" required>
            <input autoComplete="off" className={baseInputClass()} value={form.username ?? ""} onChange={(event) => setField("username", event.target.value)} />
          </Field>
        ) : (
        <AdEmailField
          key="add-ad-email"
          email={form.email}
          onNameVerified={(name) => setField("name", name)}
          onEmailChange={(email) => setField("email", email)}
          onVerified={(emailVerified) => setField("emailVerified", emailVerified)}
          verified={form.emailVerified}
        />
        )}

        {form.provider !== "LOCAL" ? <Field label="Name" required>
          <input
            className={baseInputClass()}
            onChange={(event) => setField("name", event.target.value)}
            type="text"
            value={form.name}
          />
        </Field> : null}

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
              }));
            }}
            options={roleOptions()}
            placeholder="Select Role"
            searchPlaceholder="Search role"
            value={form.role}
          />
        </Field>

        {form.provider === "LOCAL" ? <>
          <Field label="Password" required>
            <input type="password" autoComplete="new-password" minLength={6} className={baseInputClass()} value={form.password ?? ""} onChange={(event) => setField("password", event.target.value)} />
          </Field>
          <Field label="Confirm Password" required>
            <input type="password" autoComplete="new-password" className={baseInputClass()} value={form.confirmPassword ?? ""} onChange={(event) => setField("confirmPassword", event.target.value)} />
          </Field>
        </> : null}

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
          disabled={isSubmitting || (form.provider !== "LOCAL" && !form.emailVerified)}
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
          const proof = await confirmDestructiveAction(`/users/${dialog.user.id}`, `User: ${dialog.user.name}`);
          if (!proof) return;
          const response = await fetch(`/api/users/${dialog.user.id}`, {
            method: "DELETE",
            headers: { "x-delete-proof": proof },
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
    if (form.provider !== "LOCAL" && !form.email.trim()) {
      return "Email is required.";
    }

    if (form.provider !== "LOCAL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Email must be a valid email address.";
    }

    if (form.provider !== "LOCAL" && !form.emailVerified) {
      return "Verify the Email against Active Directory before saving.";
    }

    if (form.provider !== "LOCAL" && !form.name.trim()) {
      return "Name is required.";
    }

    if (!form.role) {
      return "Role is required.";
    }

    if (form.role === "USER" && cleanOrganizationAssignments(form).length === 0) {
      return "At least one organization assignment is required for User.";
    }

    if (
      form.role === "USER" &&
      !cleanOrganizationAssignments(form).some(
        (assignment) => form.primaryOrganizationKey ? organizationAssignmentKey(assignment) === form.primaryOrganizationKey : assignment.organizationTag === form.primaryOrganizationTag,
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

    if (form.provider === "LOCAL") {
      const username = localUsernameSchema.safeParse(form.username);
      if (!username.success) { setError(username.error.issues[0].message); setIsSubmitting(false); return; }
    }
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryOrganizationKey: form.primaryOrganizationKey,
          ...(form.provider === "LOCAL" ? { username: form.username } : {}),
          ...(form.provider === "LOCAL" ? {} : { email: form.email.trim(), name: form.name.trim() }),
          organizationAssignments:
            form.role === "USER" ? cleanOrganizationAssignments(form) : [],
          primaryOrganizationTag:
            form.role === "USER" ? form.primaryOrganizationTag : null,
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
        {form.provider === "LOCAL" ? <Field label="Username" required><input autoComplete="off" className={baseInputClass()} value={form.username ?? ""} onChange={(event) => setField("username", event.target.value)} /></Field> : (
        <AdEmailField
          email={form.email}
          onEmailChange={(email) => setField("email", email)}
          onVerified={(emailVerified) => setField("emailVerified", emailVerified)}
          verified={form.emailVerified}
        />
        )}

        {form.provider !== "LOCAL" ? <Field label="Name" required>
          <input
            className={baseInputClass()}
            onChange={(event) => setField("name", event.target.value)}
            type="text"
            value={form.name}
          />
        </Field> : null}

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
              }));
            }}
            options={roleOptions()}
            placeholder="Select Role"
            searchPlaceholder="Search role"
            value={form.role}
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
          disabled={isSubmitting || (form.provider !== "LOCAL" && !form.emailVerified)}
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
  return (
    <ModalShell onClose={onClose} title="User Detail">
      <div className="flex items-start gap-4 rounded-md border border-border bg-surface p-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-navy text-lg font-bold text-white">
          {getUserInitials(user.name)}
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-navy">{user.name}</h3>
          <p className={`mt-1 text-sm font-medium ${user.email ? "text-muted-foreground" : "text-status-fail"}`}>
            {user.email ?? "Not Linked"}
          </p>
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
              <th className="px-5 py-4 font-bold">Team</th>
              <th className="px-5 py-4 font-bold">Organization</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Action</th>
              <th className="px-5 py-4 font-bold">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const primary = primaryOrganizationDisplay(user);
              return (
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
                    <span>{user.provider === "LOCAL" ? "Local" : user.email ?? "Not Linked"}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${roleTone(user.systemRole)}`}
                  >
                    {roleLabels[user.systemRole]}
                  </span>
                </td>
                <td className="px-5 py-4 text-ink">{primary.team}</td>
                <td className="px-5 py-4 text-ink">{primary.organization}</td>
                <td className="px-5 py-4">
                  <StatusBadge isActive={user.isActive} />
                </td>
                <td className="px-5 py-4">
                  <UserActionMenu
                    isActive={user.isActive}
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
              );
            })}
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
  const [teamFilter, setTeamFilter] = useState(filters.team ?? "ALL");
  useEffect(() => {
    setRoleFilter(filters.role);
    setTeamFilter(filters.team ?? "ALL");
  }, [filters.role, filters.team]);

  const searchSuggestions = useMemo(() => users.flatMap((user) => {
    const email = user.provider === "LOCAL" ? "Local" : user.email ?? "Not Linked";
    const primary = primaryOrganizationDisplay(user);

    return [
      { category: "NAME", label: user.name, searchText: `${email} ${roleLabels[user.systemRole]}`, value: user.name },
      { category: "MAIL", label: email, searchText: user.name, value: email },
      { category: "ROLE", label: roleLabels[user.systemRole], searchText: `${user.name} ${email}`, value: roleLabels[user.systemRole] },
      { category: "TEAM", label: primary.team, searchText: user.name, value: primary.team },
      { category: "ORGANIZATION", label: primary.organization, searchText: user.name, value: primary.organization },
      { category: "ACCOUNT", label: user.localUsername ?? (user.provider === "LOCAL" ? "Local" : "Active Directory"), searchText: user.name, value: user.localUsername ?? (user.provider === "LOCAL" ? "Local" : "Active Directory") },
      ...tagPills(user).map((tag) => ({ category: "TAG", label: tag, searchText: `${user.name} ${email}`, value: tag })),
    ];
  }), [users]);

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

      <InstantFilterForm
        action="/user"
        className="grid gap-3 rounded-md border border-border bg-white p-4 shadow-sm lg:grid-cols-[1fr_190px_170px_auto]"
        method="get"
      >
        <SearchCombobox
          categories={[
            { label: "All", value: "ALL" },
            { label: "Name", value: "NAME" },
            { label: "Mail", value: "MAIL" },
            { label: "Role", value: "ROLE" },
            { label: "Tag", value: "TAG" },
            { label: "Team", value: "TEAM" },
            { label: "Organization", value: "ORGANIZATION" },
            { label: "Account", value: "ACCOUNT" },
          ]}
          defaultValue={filters.search}
          name="q"
          placeholder="Search users, local accounts, teams, organizations..."
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
          name="team"
          onChange={setTeamFilter}
          options={[{ label: "All teams", value: "ALL" }, ...organizationTeams]}
          placeholder="All teams"
          searchPlaceholder="Search team"
          value={teamFilter}
        />

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
      </InstantFilterForm>

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

