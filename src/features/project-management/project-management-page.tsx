"use client";
import { confirmDestructiveAction } from "@/components/form/confirm-destructive-action";

import { formatProjectLabel } from "@/lib/project-label";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Layers,
  MoreVertical,
  CirclePlus,
  FileDown,
  Loader2,
  SquarePen,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { SearchCombobox } from "@/components/form/search-combobox";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import { TablePagination } from "@/components/table/table-pagination";
import type { ProjectRow, ProjectTransactionHistoryRow, ProjectUserOption } from "@/lib/project-management";

type ProjectStatus = "ACTIVE" | "PENDING_APPROVAL" | "CLOSED";

type ProjectFormState = {
  leadUserIds: string[];
  memberUserIds: string[];
  name: string;
  customerName: string;
  projectId: string;
  status: ProjectStatus;
};

type DialogState =
  | { type: "ADD" }
  | { project: ProjectRow; type: "DELETE" }
  | { project: ProjectRow; type: "DETAIL" }
  | { project: ProjectRow; type: "EDIT" }
  | null;

function emptyForm(): ProjectFormState {
  return {
    leadUserIds: [],
    memberUserIds: [],
    name: "",
    customerName: "",
    projectId: "",
    status: "ACTIVE",
  };
}

function toForm(project: ProjectRow): ProjectFormState {
  return {
    leadUserIds: project.leads.map((lead) => lead.id),
    memberUserIds: project.members.map((member) => member.id),
    name: project.name,
    customerName: project.customerName,
    projectId: project.projectId ?? "",
    status: project.status,
  };
}

function inputClass() {
  return "h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-medium text-ink outline-none ring-brand-accent/20 transition focus:ring-4";
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

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: typeof Layers;
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

function StatusBadge({ status }: { status: ProjectStatus }) {
  const isActive = status === "ACTIVE";
  const isPending = status === "PENDING_APPROVAL";

  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
      <span className={isActive ? "h-2 w-2 rounded-full bg-status-ready" : isPending ? "h-2 w-2 rounded-full bg-status-request" : "h-2 w-2 rounded-full bg-muted-foreground"} />
      {isActive ? "Active" : isPending ? "Pending Approval" : "Closed"}
    </span>
  );
}

function ModalShell({
  children,
  maxWidth = "max-w-2xl",
  onClose,
  title,
}: {
  children: React.ReactNode;
  maxWidth?: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className={`w-full ${maxWidth} overflow-visible rounded-md border border-border bg-white shadow-xl`}>
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

function optionLabel(option: ProjectUserOption) {
  return `${option.name} (${option.email})`;
}

function SearchableUserSelect({
  disabledIds = [],
  label,
  onChange,
  options,
  required = false,
  value,
}: {
  disabledIds?: string[];
  label: string;
  onChange: (value: string) => void;
  options: ProjectUserOption[];
  required?: boolean;
  value: string;
}) {
  return (
    <Field label={label} required={required}>
      <SearchableDropdown
        onChange={onChange}
        options={options.map((option) => ({
          disabled: disabledIds.includes(option.id),
          description: option.position ?? "",
          label: option.name,
          searchText: `${option.name} ${option.position ?? ""}`,
          value: option.id,
        }))}
        placeholder="Select user"
        searchPlaceholder="Search user..."
        value={value}
      />
    </Field>
  );
}

function UserMultiPicker({
  disabledIds = [],
  label,
  onChange,
  options,
  required = false,
  selectedIds,
}: {
  disabledIds?: string[];
  label: string;
  onChange: (value: string[]) => void;
  options: ProjectUserOption[];
  required?: boolean;
  selectedIds: string[];
}) {
  const [candidateId, setCandidateId] = useState("");
  const selectedUsers = selectedIds
    .map((id) => options.find((option) => option.id === id))
    .filter(Boolean) as ProjectUserOption[];

  return (
    <div className="md:col-span-2">
      <SearchableUserSelect
        disabledIds={[...disabledIds, ...selectedIds].filter(Boolean)}
        label={label}
        onChange={(id) => {
          if (!id) return;
          onChange([...selectedIds, id]);
          setCandidateId("");
        }}
        options={options}
        required={required}
        value={candidateId}
      />
      {selectedUsers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <span
              className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-bold text-navy"
              key={user.id}
            >
              {user.name}
              <button
                className="text-muted-foreground hover:text-status-fail"
                onClick={() => onChange(selectedIds.filter((id) => id !== user.id))}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProjectFormModal({
  initialState,
  mode,
  onClose,
  onSaved,
  projectId,
  userOptions,
}: {
  initialState: ProjectFormState;
  mode: "ADD" | "EDIT";
  onClose: () => void;
  onSaved: (project: ProjectRow) => void;
  projectId?: string;
  userOptions: ProjectUserOption[];
}) {
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<Key extends keyof ProjectFormState>(
    key: Key,
    value: ProjectFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    const missingFields = [];
    if (!form.name.trim()) missingFields.push("Project Name");
    if (!form.projectId.trim()) missingFields.push("Project ID");
    if (!form.customerName.trim()) missingFields.push("Customer Name");
    if (form.leadUserIds.length === 0) missingFields.push("Lead Project");

    if (missingFields.length > 0) {
      setError(`Required fields missing: ${missingFields.join(", ")}.`);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(mode === "EDIT" ? `/api/projects/${projectId}` : "/api/projects", {
        body: JSON.stringify({
          leadUserIds: form.leadUserIds,
          memberUserIds: form.memberUserIds,
          name: form.name.trim(),
          customerName: form.customerName.trim(),
          projectId: form.projectId.trim().toUpperCase(),
          status: form.status,
        }),
        headers: { "Content-Type": "application/json" },
        method: mode === "EDIT" ? "PATCH" : "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        project?: ProjectRow;
      };

      if (!response.ok || !data.project) {
        throw new Error(data.message ?? "Unable to save project.");
      }

      onSaved(data.project);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      title={mode === "ADD" ? "Add Project" : "Edit Project"}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Project Name" required>
          <input
            className={inputClass()}
            disabled={mode === "EDIT"}
            onChange={(event) => setField("name", event.target.value)}
            type="text"
            value={form.name}
          />
        </Field>

        <Field label="Project ID" required>
          <input
            className={inputClass()}
            disabled={mode === "EDIT"}
            onChange={(event) => setField("projectId", event.target.value.toUpperCase())}
            type="text"
            value={form.projectId}
          />
        </Field>

        <Field label="Customer Name" required>
          <input className={inputClass()} onChange={(event) => setField("customerName", event.target.value)} type="text" value={form.customerName} />
        </Field>

        {mode === "EDIT" ? (
          <Field label="Project Status" required>
            <SearchableDropdown
              onChange={(value) => setField("status", value as ProjectStatus)}
              options={[
                { label: "Active", value: "ACTIVE" },
                { label: "Closed", value: "CLOSED" },
              ]}
              placeholder="Select project status"
              searchPlaceholder="Search status"
              value={form.status}
            />
          </Field>
        ) : null}

        <UserMultiPicker
          disabledIds={form.memberUserIds}
          label="Lead Project"
          onChange={(ids) => setField("leadUserIds", ids)}
          options={userOptions}
          required
          selectedIds={form.leadUserIds}
        />

        <UserMultiPicker
          disabledIds={form.leadUserIds}
          label="Team Member"
          onChange={(ids) => setField("memberUserIds", ids)}
          options={userOptions}
          selectedIds={form.memberUserIds}
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
          onClick={handleSave}
          type="button"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function DeleteProjectModal({
  onClose,
  onDelete,
  project,
}: {
  onClose: () => void;
  onDelete: () => void;
  project: ProjectRow;
}) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDelete() {
    setError("");
    setIsSubmitting(true);

    try {
      const proof = await confirmDestructiveAction(`/projects/${project.id}`, `Project: ${project.name}`);
      if (!proof) { setIsSubmitting(false); return; }
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE", headers: { "x-delete-proof": proof } });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to delete project.");
      }

      onDelete();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Delete Project">
      <div className="space-y-3 text-sm font-medium leading-6 text-ink">
        <p>Are you sure you want to delete this project?</p>
        <p>
          Project: <span className="font-bold text-navy">{formatProjectLabel(project)}</span>
        </p>
        <p>
          Project ID: <span className="font-bold text-navy">{project.projectId ?? "-"}</span>
        </p>
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
          className="h-11 rounded-md bg-status-fail px-4 text-sm font-bold text-white hover:bg-status-fail/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={handleDelete}
          type="button"
        >
          {isSubmitting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}

const transactionTypeLabels = {
  BORROW: "Borrow",
  SOLD: "Sold",
  USING: "Using",
} as const;

function transactionStatusLabel(status: ProjectTransactionHistoryRow["status"]) {
  return status
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_match, separator: string, character: string) =>
      `${separator ? " " : ""}${character.toUpperCase()}`,
    );
}

function ProjectTransactionHistory({
  error,
  isLoading,
  onExport,
  exportingId,
  rows,
}: {
  error: string;
  exportingId: string | null;
  isLoading: boolean;
  onExport: (transactionId: string) => void;
  rows: ProjectTransactionHistoryRow[];
}) {
  const router = useRouter();

  return (
    <section className="mt-6 overflow-hidden rounded-md border border-border bg-surface/40">
      <div className="border-b border-border bg-white px-4 py-4">
        <h3 className="text-lg font-bold text-navy">Transaction History</h3>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Requests linked to this project.
        </p>
      </div>
      {error ? <p className="border-b border-border bg-status-fail/10 px-4 py-3 text-sm font-semibold text-status-fail">{error}</p> : null}
      <div className="max-h-72 overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-bold">Transaction ID</th>
              <th className="px-4 py-3 font-bold">Borrower</th>
              <th className="px-4 py-3 font-bold">Type</th>
              <th className="px-4 py-3 font-bold">Request Date</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm font-medium text-muted-foreground" colSpan={6}>Loading transactions...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm font-medium text-muted-foreground" colSpan={6}>No transactions found.</td>
              </tr>
            ) : rows.map((transaction) => (
              <tr
                className="cursor-pointer transition hover:bg-brand-accent/5"
                key={transaction.id}
                onClick={() => router.push(`/logs/${transaction.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") router.push(`/logs/${transaction.id}`);
                }}
                tabIndex={0}
              >
                <td className="px-4 py-3 font-bold text-navy">{transaction.transactionReference}</td>
                <td className="px-4 py-3 font-semibold text-ink">{transaction.requestedBy}</td>
                <td className="px-4 py-3 font-semibold text-ink">{transactionTypeLabels[transaction.type]}</td>
                <td className="px-4 py-3 font-medium text-ink">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(transaction.requestDate))}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-navy">{transactionStatusLabel(transaction.status)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-bold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={exportingId === transaction.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onExport(transaction.id);
                    }}
                    type="button"
                  >
                    {exportingId === transaction.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    Export PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProjectDetailModal({ project, onClose, onChanged }: { project: ProjectRow; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [transactions, setTransactions] = useState<ProjectTransactionHistoryRow[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoadingHistory(true);
    setHistoryError("");
    fetch(`/api/projects/${project.id}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { message?: string; transactions?: ProjectTransactionHistoryRow[] };
        if (!response.ok) throw new Error(data.message ?? "Unable to load project transactions.");
        if (active) setTransactions(data.transactions ?? []);
      })
      .catch((caught) => {
        if (active) setHistoryError(caught instanceof Error ? caught.message : "Unable to load project transactions.");
      })
      .finally(() => {
        if (active) setIsLoadingHistory(false);
      });
    return () => { active = false; };
  }, [project.id]);

  async function respond(action: "approve" | "reject") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/${action}`, { method: "POST" });
      if (!response.ok) { const data = await response.json().catch(() => ({})) as { message?: string }; throw new Error(data.message ?? "Unable to update project."); }
      onChanged(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update project."); }
    finally { setBusy(false); }
  }

  async function exportTransaction(transactionId: string) {
    setExportingId(transactionId);
    setHistoryError("");
    try {
      const { downloadTransactionPdf } = await import("@/features/transactions/transaction-pdf-download");
      await downloadTransactionPdf(transactionId);
    } catch (caught) {
      setHistoryError(caught instanceof Error ? caught.message : "Unable to export transaction PDF.");
    } finally {
      setExportingId(null);
    }
  }

  return <ModalShell maxWidth="max-w-4xl" onClose={onClose} title="Project Details">
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Project"><div className={`${inputClass()} flex items-center bg-surface`}>{formatProjectLabel(project)}</div></Field>
      <Field label="Project ID"><div className={`${inputClass()} flex items-center bg-surface`}>{project.projectId ?? "-"}</div></Field>
      <Field label="Customer Name"><div className={`${inputClass()} flex items-center bg-surface`}>{project.customerName}</div></Field>
      <Field label="Project Status"><div className="flex h-11 items-center rounded-md border border-border bg-surface px-3"><StatusBadge status={project.status} /></div></Field>
      <Field label="Lead Project"><div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">{project.leads.map((lead) => <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-navy" key={lead.id}>{lead.name}</span>)}</div></Field>
      <Field label="Team Member"><div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">{project.members.length ? project.members.map((member) => <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-navy" key={member.id}>{member.name}</span>) : <span className="text-sm text-muted-foreground">-</span>}</div></Field>
    </div>
    <ProjectTransactionHistory error={historyError} exportingId={exportingId} isLoading={isLoadingHistory} onExport={exportTransaction} rows={transactions} />
    {error ? <p className="mt-4 rounded-md bg-status-fail/10 p-3 text-sm font-semibold text-status-fail">{error}</p> : null}
    <div className="mt-5 flex justify-end gap-3">
      {project.canApprove ? <><button className="h-11 rounded-md border border-status-fail px-4 text-sm font-bold text-status-fail" disabled={busy} onClick={() => respond("reject")} type="button">Reject</button><button className="h-11 rounded-md bg-status-ready px-4 text-sm font-bold text-white" disabled={busy} onClick={() => respond("approve")} type="button">Confirm</button></> : <button className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy" onClick={onClose} type="button">Close</button>}
    </div>
  </ModalShell>;
}

function ProjectActionMenu({
  onDelete,
  onEdit,
}: {
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !portalMenuRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !portalMenuRef.current) return;

    function updatePosition() {
      if (!triggerRef.current || !portalMenuRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const menuRect = portalMenuRef.current.getBoundingClientRect();
      const gap = 8;
      const viewportPadding = 8;
      const left = Math.min(
        Math.max(viewportPadding, triggerRect.right - menuRect.width),
        window.innerWidth - menuRect.width - viewportPadding,
      );
      const canOpenBelow = triggerRect.bottom + gap + menuRect.height <= window.innerHeight - viewportPadding;
      const preferredTop = canOpenBelow
        ? triggerRect.bottom + gap
        : triggerRect.top - menuRect.height - gap;
      const top = Math.min(
        Math.max(viewportPadding, preferredTop),
        window.innerHeight - menuRect.height - viewportPadding,
      );

      setMenuPosition({ left, top });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function handleAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="inline-flex">
      <button
        aria-expanded={open}
        aria-label="Open project actions"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-navy hover:bg-surface"
        onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }}
        ref={triggerRef}
        type="button"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open ? createPortal(
        <div
          className="fixed z-[100] w-36 rounded-md border border-border bg-white p-1 shadow-lg"
          onClick={(event) => event.stopPropagation()}
          ref={portalMenuRef}
          style={menuPosition}
        >
          <button
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface"
            onClick={() => handleAction(onEdit)}
            type="button"
          >
            <SquarePen className="h-4 w-4" />
            Edit
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-status-fail hover:bg-status-fail/10"
            onClick={() => handleAction(onDelete)}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function ProjectManagementPage({
  canCreate,
  initialProjects,
  userOptions,
}: {
  canCreate: boolean;
  initialProjects: ProjectRow[];
  userOptions: ProjectUserOption[];
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");

  const searchSuggestions = useMemo(() => projects.flatMap((project) => [
    { category: "PROJECT", label: formatProjectLabel(project), searchText: `${project.projectId ?? ""} ${project.customerName} ${project.leads.map((lead) => lead.name).join(" ")}`, value: project.name },
    ...(project.projectId ? [{ category: "ID", label: project.projectId, searchText: project.name, value: project.projectId }] : []),
    ...(project.leads.map((lead) => ({ category: "LEAD", label: lead.name, searchText: `${lead.email} ${project.name}`, value: lead.name }))),
    ...project.members.map((member) => ({ category: "MEMBER", label: member.name, searchText: `${member.email} ${project.name}`, value: member.name })),
  ]), [projects]);

  const filteredProjects = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) {
      return projects;
    }

    return projects.filter((project) =>
      [
        project.name,
        project.customerName,
        project.projectId ?? "",
        project.leads.map((lead) => lead.name).join(" "),
        project.leads.map((lead) => lead.email).join(" "),
        project.status,
        ...project.members.flatMap((member) => [member.name, member.email]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [projects, query]);

  const activeCount = projects.filter((project) => project.status === "ACTIVE").length;
  const closedCount = projects.filter((project) => project.status === "CLOSED").length;

  function upsertProject(nextProject: ProjectRow) {
    setProjects((current) => {
      const exists = current.some((project) => project.id === nextProject.id);
      if (exists) {
        return current.map((project) =>
          project.id === nextProject.id ? nextProject : project,
        );
      }

      return [nextProject, ...current];
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          detail="All tracked projects"
          icon={Layers}
          label="Total Projects"
          value={projects.length}
        />
        <MetricCard
          detail="Currently active"
          icon={BriefcaseBusiness}
          label="Active Projects"
          value={activeCount}
        />
        <MetricCard
          detail="Closed projects"
          icon={UserCheck}
          label="Closed Projects"
          value={closedCount}
        />
      </section>

      <section className="grid gap-3 rounded-md border border-border bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]">
        <SearchCombobox
          categories={[
            { label: "All", value: "ALL" },
            { label: "Project", value: "PROJECT" },
            { label: "Customer", value: "CUSTOMER" },
            { label: "ID", value: "ID" },
            { label: "Lead", value: "LEAD" },
            { label: "Member", value: "MEMBER" },
          ]}
          onChange={setQuery}
          placeholder="Search project name, project id, lead, member"
          suggestions={searchSuggestions}
          value={query}
        />

        {canCreate ? (
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm hover:bg-navy/90"
            onClick={() => setDialog({ type: "ADD" })}
            type="button"
          >
            <CirclePlus className="h-4 w-4" />
            Add Project
          </button>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-[24%] px-5 py-4 font-bold">Project Name</th>
                <th className="w-[18%] px-5 py-4 font-bold">Customer</th>
                <th className="w-[16%] px-5 py-4 font-bold">Project ID</th>
                <th className="w-[18%] px-5 py-4 font-bold">Lead Project</th>
                <th className="w-[24%] px-5 py-4 font-bold">Team Member</th>
                <th className="w-[12%] px-5 py-4 font-bold">Status</th>
                <th className="w-[6%] px-5 py-4 font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProjects.map((project) => (
              <tr className="cursor-pointer align-middle transition hover:bg-gray-50" key={project.id} onClick={() => setDialog({ project, type: "DETAIL" })}>
                  <td className="truncate px-5 py-4 font-bold text-navy" title={project.name}><button className="text-left hover:text-brand-accent" onClick={() => setDialog({ project, type: "DETAIL" })} type="button">{project.name}</button></td>
                  <td className="truncate px-5 py-4 font-semibold text-ink" title={project.customerName}>{project.customerName}</td>
                  <td className="truncate px-5 py-4 font-semibold text-ink" title={project.projectId ?? "-"}>{project.projectId ?? "-"}</td>
                  <td className="truncate px-5 py-4 text-ink" title={project.leads.map(optionLabel).join(", ") || "-"}>
                    {project.leads.length > 0 ? project.leads.map((lead) => lead.name).join(", ") : "-"}
                  </td>
                  <td className="truncate px-5 py-4 text-ink" title={project.members.map((member) => member.name).join(", ") || "-"}>
                    {project.members.length > 0
                      ? project.members.map((member) => member.name).join(", ")
                      : "-"}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-5 py-4">
                    {project.canApprove ? (
                      <button
                        className="h-9 rounded-md bg-status-ready px-3 text-xs font-bold text-white hover:opacity-90"
                        onClick={async (event) => {
                          event.stopPropagation();
                          const response = await fetch(`/api/projects/${project.id}/approve`, { method: "POST" });
                          if (response.ok) {
                            setProjects((current) => current.map((item) => item.id === project.id ? { ...item, canApprove: false, status: "ACTIVE" } : item));
                            router.refresh();
                          }
                        }}
                        type="button"
                      >
                        Confirm
                      </button>
                    ) : project.canManage ? (
                      <ProjectActionMenu
                        onDelete={() => setDialog({ project, type: "DELETE" })}
                        onEdit={() => setDialog({ project, type: "EDIT" })}
                      />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">Read only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="border-t border-border px-5 py-10 text-center text-sm font-medium text-muted-foreground">
            No projects found.
          </div>
        ) : null}
      </section>

      <TablePagination
        currentPage={1}
        hrefForPage={() => "#"}
        summary={`Showing ${filteredProjects.length.toLocaleString("en-US")} of ${projects.length.toLocaleString("en-US")} projects`}
        totalPages={1}
      />

      {dialog?.type === "ADD" ? (
        <ProjectFormModal
          initialState={emptyForm()}
          mode="ADD"
          onClose={() => setDialog(null)}
          onSaved={upsertProject}
          userOptions={userOptions}
        />
      ) : null}

      {dialog?.type === "EDIT" ? (
        <ProjectFormModal
          initialState={toForm(dialog.project)}
          mode="EDIT"
          onClose={() => setDialog(null)}
          onSaved={upsertProject}
          projectId={dialog.project.id}
          userOptions={userOptions}
        />
      ) : null}

      {dialog?.type === "DELETE" ? (
        <DeleteProjectModal
          onClose={() => setDialog(null)}
          onDelete={() => {
            setProjects((current) =>
              current.filter((project) => project.id !== dialog.project.id),
            );
            router.refresh();
          }}
          project={dialog.project}
        />
      ) : null}
      {dialog?.type === "DETAIL" ? <ProjectDetailModal onChanged={() => { setProjects((current) => current.map((item) => item.id === dialog.project.id ? { ...item, canApprove: false, status: "ACTIVE" } : item)); router.refresh(); }} onClose={() => setDialog(null)} project={dialog.project} /> : null}
    </div>
  );
}

export function ProjectManagementForbidden() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-navy">Project Management</h1>
      <p className="mt-3 text-sm font-medium text-muted-foreground">
        Only admin users can manage projects.
      </p>
    </section>
  );
}

