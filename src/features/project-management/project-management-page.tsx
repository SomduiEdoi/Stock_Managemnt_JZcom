"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Layers,
  MoreVertical,
  Plus,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { SearchCombobox } from "@/components/form/search-combobox";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import type { ProjectRow, ProjectUserOption } from "@/lib/project-management";

type ProjectStatus = "ACTIVE" | "CLOSED";

type ProjectFormState = {
  leadUserId: string;
  memberUserIds: string[];
  name: string;
  projectId: string;
  status: ProjectStatus;
};

type DialogState =
  | { type: "ADD" }
  | { project: ProjectRow; type: "DELETE" }
  | { project: ProjectRow; type: "EDIT" }
  | null;

function emptyForm(): ProjectFormState {
  return {
    leadUserId: "",
    memberUserIds: [],
    name: "",
    projectId: "",
    status: "ACTIVE",
  };
}

function toForm(project: ProjectRow): ProjectFormState {
  return {
    leadUserId: project.lead?.id ?? "",
    memberUserIds: project.members.map((member) => member.id),
    name: project.name,
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

  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
      <span className={isActive ? "h-2 w-2 rounded-full bg-status-ready" : "h-2 w-2 rounded-full bg-muted-foreground"} />
      {isActive ? "Active" : "Closed"}
    </span>
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
          description: option.email,
          label: option.name,
          searchText: optionLabel(option),
          value: option.id,
        }))}
        placeholder="Search user by name or email"
        searchPlaceholder="Search user by name or email"
        value={value}
      />
    </Field>
  );
}

function MemberPicker({
  leadUserId,
  memberUserIds,
  onChange,
  options,
}: {
  leadUserId: string;
  memberUserIds: string[];
  onChange: (value: string[]) => void;
  options: ProjectUserOption[];
}) {
  const [candidateId, setCandidateId] = useState("");
  const selectedMembers = memberUserIds
    .map((id) => options.find((option) => option.id === id))
    .filter(Boolean) as ProjectUserOption[];

  return (
    <div className="md:col-span-2">
      <SearchableUserSelect
        disabledIds={[leadUserId, ...memberUserIds].filter(Boolean)}
        label="Team Member"
        onChange={(id) => {
          if (!id) return;
          onChange([...memberUserIds, id]);
          setCandidateId("");
        }}
        options={options}
        value={candidateId}
      />
      {selectedMembers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedMembers.map((member) => (
            <span
              className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-bold text-navy"
              key={member.id}
            >
              {member.name}
              <button
                className="text-muted-foreground hover:text-status-fail"
                onClick={() => onChange(memberUserIds.filter((id) => id !== member.id))}
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
    if (!form.leadUserId) missingFields.push("Lead Project");

    if (missingFields.length > 0) {
      setError(`Required fields missing: ${missingFields.join(", ")}.`);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(mode === "EDIT" ? `/api/projects/${projectId}` : "/api/projects", {
        body: JSON.stringify({
          leadUserId: form.leadUserId,
          memberUserIds: form.memberUserIds,
          name: form.name.trim(),
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
            onChange={(event) => setField("name", event.target.value)}
            type="text"
            value={form.name}
          />
        </Field>

        <Field label="Project ID" required>
          <input
            className={inputClass()}
            onChange={(event) => setField("projectId", event.target.value.toUpperCase())}
            type="text"
            value={form.projectId}
          />
        </Field>

        <div className="md:col-span-2">
          <SearchableUserSelect
            disabledIds={form.memberUserIds}
            label="Lead Project"
            onChange={(id) => setField("leadUserId", id)}
            options={userOptions}
            required
            value={form.leadUserId}
          />
        </div>

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

        <MemberPicker
          leadUserId={form.leadUserId}
          memberUserIds={form.memberUserIds}
          onChange={(ids) => setField("memberUserIds", ids)}
          options={userOptions}
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
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
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
          Project Name: <span className="font-bold text-navy">{project.name}</span>
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

function ProjectActionMenu({
  onDelete,
  onEdit,
}: {
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        aria-label="Open project actions"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-navy hover:bg-surface"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-20 w-36 rounded-md border border-border bg-white p-1 shadow-lg">
          <button
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            type="button"
          >
            <CheckCircle2 className="h-4 w-4" />
            Edit
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-status-fail hover:bg-status-fail/10"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectManagementPage({
  initialProjects,
  userOptions,
}: {
  initialProjects: ProjectRow[];
  userOptions: ProjectUserOption[];
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");

  const searchSuggestions = useMemo(() => projects.flatMap((project) => [
    { category: "PROJECT", label: project.name, searchText: `${project.projectId ?? ""} ${project.lead?.name ?? ""}`, value: project.name },
    ...(project.projectId ? [{ category: "ID", label: project.projectId, searchText: project.name, value: project.projectId }] : []),
    ...(project.lead ? [{ category: "LEAD", label: project.lead.name, searchText: `${project.lead.email} ${project.name}`, value: project.lead.name }] : []),
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
        project.projectId ?? "",
        project.lead?.name ?? "",
        project.lead?.email ?? "",
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
            { label: "ID", value: "ID" },
            { label: "Lead", value: "LEAD" },
            { label: "Member", value: "MEMBER" },
          ]}
          onChange={setQuery}
          placeholder="Search project name, project id, lead, member"
          suggestions={searchSuggestions}
          value={query}
        />

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white shadow-sm hover:bg-navy/90"
          onClick={() => setDialog({ type: "ADD" })}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Add Project
        </button>
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-[24%] px-5 py-4 font-bold">Project Name</th>
                <th className="w-[16%] px-5 py-4 font-bold">Project ID</th>
                <th className="w-[18%] px-5 py-4 font-bold">Lead Project</th>
                <th className="w-[24%] px-5 py-4 font-bold">Team Member</th>
                <th className="w-[12%] px-5 py-4 font-bold">Status</th>
                <th className="w-[6%] px-5 py-4 font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProjects.map((project) => (
                <tr className="align-middle" key={project.id}>
                  <td className="truncate px-5 py-4 font-bold text-navy" title={project.name}>{project.name}</td>
                  <td className="truncate px-5 py-4 font-semibold text-ink" title={project.projectId ?? "-"}>{project.projectId ?? "-"}</td>
                  <td className="truncate px-5 py-4 text-ink" title={project.lead ? optionLabel(project.lead) : "-"}>
                    {project.lead?.name ?? "-"}
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
                    <ProjectActionMenu
                      onDelete={() => setDialog({ project, type: "DELETE" })}
                      onEdit={() => setDialog({ project, type: "EDIT" })}
                    />
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

      <footer className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          Showing {filteredProjects.length.toLocaleString("en-US")} of{" "}
          {projects.length.toLocaleString("en-US")} projects
        </p>
        <div className="flex gap-2">
          <button
            aria-disabled="true"
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 font-semibold opacity-50"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            aria-disabled="true"
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-navy px-3 font-semibold text-white opacity-50"
            type="button"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </footer>

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

