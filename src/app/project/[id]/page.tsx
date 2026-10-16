import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import { getProjectDetail } from "@/lib/project-management";
import { formatProjectLabel } from "@/lib/project-label";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser("/project"); const { id } = await params; const { project: rawProject, canApprove } = await getProjectDetail(user, id);
  const project = { ...rawProject, name: formatProjectLabel(rawProject) };
  const leadNames = project.members.filter((member) => member.projectTag === "LEAD_PROJECT").map((member) => member.user.name); if (project.leadUser) leadNames.unshift(project.leadUser.name);
  return <section className="mx-auto max-w-3xl rounded-md border border-border bg-white p-6 shadow-sm"><Link className="text-sm font-bold text-brand-accent" href="/project">Back to Projects</Link><h1 className="mt-4 text-2xl font-bold text-navy">{project.name}</h1><div className="mt-5 grid gap-4 sm:grid-cols-2"><p><b>Customer:</b> {project.customerName}</p><p><b>Status:</b> {project.status}</p><p><b>Project Lead:</b> {leadNames.join(", ") || "-"}</p></div>{canApprove ? <div className="mt-8 flex gap-3"><form action={`/api/projects/${project.id}/approve`} method="post"><button className="rounded-md bg-status-ready px-4 py-2 font-bold text-white" type="submit">Confirm</button></form><form action={`/api/projects/${project.id}/reject`} method="post"><button className="rounded-md bg-status-fail px-4 py-2 font-bold text-white" type="submit">Reject</button></form></div> : null}</section>;
}
