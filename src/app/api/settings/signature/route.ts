import { NextRequest, NextResponse } from "next/server";
import {
  apiErrorResponse,
  requireApiUser,
} from "@/lib/api";
import { db } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

const maxSignatureBytes = 2 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpg"]);

function fileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function assertSignatureFile(file: File | null) {
  if (!file) {
    throw new WorkflowError("Signature file is required.", 400, "SIGNATURE_REQUIRED");
  }

  if (file.size > maxSignatureBytes) {
    throw new WorkflowError("Maximum file size is 2 MB.", 400, "SIGNATURE_TOO_LARGE");
  }

  const extension = fileExtension(file);
  const isAllowed =
    allowedMimeTypes.has(file.type) ||
    (file.type === "image/jpeg" && extension === "jpg");

  if (!isAllowed) {
    throw new WorkflowError(
      "Only PNG or JPG signature files are allowed.",
      400,
      "INVALID_SIGNATURE_TYPE",
    );
  }

  if (["jpeg", "gif", "bmp", "webp"].includes(extension)) {
    throw new WorkflowError(
      "Only PNG or JPG signature files are allowed.",
      400,
      "INVALID_SIGNATURE_TYPE",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const formData = await request.formData();
    const file = formData.get("signature");

    if (!(file instanceof File)) {
      throw new WorkflowError("Signature file is required.", 400, "SIGNATURE_REQUIRED");
    }

    assertSignatureFile(file);

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type === "image/jpeg" ? "image/jpg" : file.type;
    const signatureDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const updatedUser = await db.user.update({
      data: {
        signatureDataUrl,
        signatureUploadedAt: new Date(),
        signatureUploadedById: user.id,
      },
      select: {
        signatureDataUrl: true,
        signatureUploadedAt: true,
        signatureUploadedBy: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      where: { id: user.id },
    });

    return NextResponse.json({ signature: updatedUser });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
