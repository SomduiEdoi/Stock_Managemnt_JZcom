import { WorkflowError } from "@/lib/workflow";

export const MAX_SIGNED_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_REQUEST_BYTES = MAX_SIGNED_PDF_BYTES + 64 * 1024;

export async function readLimitedBody(request: Request, maximum: number) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maximum) throw new WorkflowError("Upload exceeds the permitted size.", 413, "REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new WorkflowError("Upload exceeds the permitted size.", 413, "REQUEST_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
