import { apiJson } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { rejectProject } from "@/lib/project-management";
import { WorkflowError } from "@/lib/workflow";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireCurrentUser("/project"); const { id } = await context.params; return apiJson(await rejectProject(user, id)); }
  catch (error) { if (error instanceof WorkflowError) return apiJson({ message: error.message }, { status: error.statusCode }); throw error; }
}

