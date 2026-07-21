"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Filter,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";

type ProjectStatus = "ACTIVE" | "ARCHIVED";

type ProjectRow = {
  code: string;
  id: string;
  lead: string;
  members: number;
  name: string;
  status: ProjectStatus;
};

type ProjectFormState = {
  code: string;
  lead: string;
  members: string;
  name: string;
  status: ProjectStatus;
};

type DialogState =
  | { type: "ADD" }
  | { project: ProjectRow; type: "DELETE" }
  | { project: ProjectRow; type: "EDIT" }
  | null;

const initialProjects: ProjectRow[] = [
  {
    code: "PRJ-001",
    id: "project-operations",
    lead: "Lead Project",
    members: 0,
    name: "Operations Project",
    status: "ACTIVE",
  },
];

function emptyForm(): ProjectFormState {
  return {
    code: "",
    lead: "",
    members: "0",
    name: "",
    status: "ACTIVE",
  };
}

function toForm(project: ProjectRow): ProjectFormState {
  return {
    code: project.code,
    lead: project.lead,
    members: String(project.members),
    name: project.name,
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
      {isActive ? "Active" : "Archived"}
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

function ProjectFormModal({
  initialState,
  mode,
  onClose,
  onSave,
}: {
  initialState: ProjectFormState;
  mode: "ADD" | "EDIT";
  onClose: () => void;
  onSave: (project: ProjectRow) => void;
}) {
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState("");

  function setField<Key extends keyof ProjectFormState>(
    key: Key,
    value: ProjectFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSave() {
    if (!form.name.trim()) {
      setError("Project name is required.");
      return;
    }

    if (!form.code.trim()) {
      setError("Project code is required.");
      return;
    }

    if (!form.lead.trim()) {
      setError("Lead is required.");
      return;
    }

    const members = Number.parseInt(form.members, 10);
    if (!Number.isFinite(members) || members < 0) {
      setError("Members must be zero or more.");
      return;
    }

    onSave({
      code: form.code.trim().toUpperCase(),
      id:
        mode === "EDIT"
          ? initialState.code.toLowerCase()
          : `project-${Date.now()}`,
      lead: form.lead.trim(),
      members,
      name: form.name.trim(),
      status: form.status,
    });
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

        <Field label="Project Code" required>
          <input
            className={inputClass()}
            onChange={(event) => setField("code", event.target.value.toUpperCase())}
            type="text"
            value={form.code}
          />
        </Field>

        <Field label="Lead" required>
          <input
            className={inputClass()}
            onChange={(event) => setField("lead", event.target.value)}
            type="text"
            value={form.lead}
          />
        </Field>

        <Field label="Members">
          <input
            className={inputClass()}
            min={0}
            onChange={(event) => setField("members", event.target.value)}
            type="number"
            value={form.members}
          />
        </Field>

        <Field label="Status">
          <select
            className={inputClass()}
            onChange={(event) => setField("status", event.target.value as ProjectStatus)}
            value={form.status}
          >
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
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
          className="h-11 rounded-md bg-navy px-4 text-sm font-bold text-white hover:bg-navy/90"
          onClick={handleSave}
          type="button"
        >
          Save
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
  return (
    <ModalShell onClose={onClose} title="Delete Project">
      <p className="text-sm font-medium leading-6 text-ink">
        Are you sure you want to delete {project.name}?
      </p>
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          className="h-11 rounded-md border border-border px-4 text-sm font-bold text-navy hover:bg-surface"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-11 rounded-md bg-status-fail px-4 text-sm font-bold text-white hover:bg-status-fail/90"
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
      </div>
    </ModalShell>
  );
}

export function ProjectManagementPage() {
  const [projects, setProjects] = useState(initialProjects);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ProjectStatus>("ALL");

  const filteredProjects = useMemo(() => {
    const search = query.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus = status === "ALL" || project.status === status;
      const matchesSearch =
        !search ||
        [project.name, project.code, project.lead, project.status]
          .join(" ")
          .toLowerCase()
          .includes(search);

      return matchesStatus && matchesSearch;
    });
  }, [projects, query, status]);

  const activeCount = projects.filter((project) => project.status === "ACTIVE").length;
  const totalMembers = projects.reduce((total, project) => total + project.members, 0);

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
    setDialog(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail="All tracked projects"
          icon={Layers}
          label="Total"
          value={projects.length}
        />
        <MetricCard
          detail="Currently available"
          icon={BriefcaseBusiness}
          label="Active"
          value={activeCount}
        />
        <MetricCard
          detail="Assigned project leads"
          icon={UserCheck}
          label="Lead Project"
          value={projects.filter((project) => project.lead !== "-").length}
        />
        <MetricCard
          detail="People in project teams"
          icon={Users}
          label="Team Member"
          value={totalMembers}
        />
      </section>

      <section className="grid gap-3 rounded-md border border-border bg-white p-4 shadow-sm lg:grid-cols-[1fr_180px_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-sm font-medium outline-none ring-brand-accent/20 transition focus:ring-4"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search project name, code, lead"
            value={query}
          />
        </div>

        <select
          className="h-11 rounded-md border border-border bg-white px-3 text-sm font-semibold text-navy"
          onChange={(event) => setStatus(event.target.value as "ALL" | ProjectStatus)}
          value={status}
        >
          <option value="ALL">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-surface"
          type="button"
        >
          <Filter className="h-4 w-4" />
          Filter
        </button>

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
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-bold">Project Name</th>
                <th className="px-5 py-4 font-bold">Project Code</th>
                <th className="px-5 py-4 font-bold">Lead</th>
                <th className="px-5 py-4 font-bold">Members</th>
                <th className="px-5 py-4 font-bold">Status</th>
                <th className="px-5 py-4 font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProjects.map((project) => (
                <tr className="align-middle" key={project.id}>
                  <td className="px-5 py-4 font-bold text-navy">{project.name}</td>
                  <td className="px-5 py-4 font-semibold text-ink">{project.code}</td>
                  <td className="px-5 py-4 text-ink">{project.lead}</td>
                  <td className="px-5 py-4 text-ink">{project.members}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold text-navy hover:bg-surface"
                        onClick={() => setDialog({ project, type: "EDIT" })}
                        type="button"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-status-fail/30 bg-white px-3 text-sm font-bold text-status-fail hover:bg-status-fail/10"
                        onClick={() => setDialog({ project, type: "DELETE" })}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
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
          onSave={upsertProject}
        />
      ) : null}

      {dialog?.type === "EDIT" ? (
        <ProjectFormModal
          initialState={toForm(dialog.project)}
          mode="EDIT"
          onClose={() => setDialog(null)}
          onSave={(project) => upsertProject({ ...project, id: dialog.project.id })}
        />
      ) : null}

      {dialog?.type === "DELETE" ? (
        <DeleteProjectModal
          onClose={() => setDialog(null)}
          onDelete={() => {
            setProjects((current) =>
              current.filter((project) => project.id !== dialog.project.id),
            );
            setDialog(null);
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
