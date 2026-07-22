"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Info, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";

type SignatureUploadButtonProps = {
  hasSignature: boolean;
};

const maxSignatureBytes = 2 * 1024 * 1024;
const invalidFormatMessage = "Only PNG and JPG files are supported.";
const maxSizeMessage = "The file size must not exceed 2 MB.";
const unreadableMessage =
  "Unable to read the uploaded image. Please upload a valid image file.";
const missingSignatureMessage =
  "Please upload your signature before approving the document.";

function isSupportedSignatureFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const validExtension = extension === "png" || extension === "jpg";
  const validMime = file.type === "image/png" || file.type === "image/jpeg";

  return validExtension && validMime;
}

async function ensureReadableImage(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unreadable image"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function validateFile(file: File) {
  if (!isSupportedSignatureFile(file)) {
    return invalidFormatMessage;
  }

  if (file.size > maxSignatureBytes) {
    return maxSizeMessage;
  }

  try {
    await ensureReadableImage(file);
  } catch {
    return unreadableMessage;
  }

  return null;
}

export function SignatureUploadButton({
  hasSignature,
}: SignatureUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function closeModal() {
    if (isUploading) {
      return;
    }

    setError(null);
    setIsDragging(false);
    setIsOpen(false);
    setSelectedFile(null);
  }

  async function selectFile(file: File) {
    const validationError = await validateFile(file);

    if (validationError) {
      setSelectedFile(null);
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);
  }

  async function uploadSelectedFile() {
    if (!selectedFile) {
      setError(missingSignatureMessage);
      return;
    }

    const validationError = await validateFile(selectedFile);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.set("signature", selectedFile);

    const response = await fetch("/api/settings/signature", {
      body: formData,
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.message ?? "Cannot upload signature.");
      setIsUploading(false);
      return;
    }

    setIsUploading(false);
    setIsOpen(false);
    setSelectedFile(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white transition hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isUploading}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Upload className="h-4 w-4" />
        {hasSignature ? "Change Signature" : "Upload Signature"}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8">
          <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-7 py-5">
              <h2 className="text-2xl font-bold text-navy">
                Upload Digital Signature
              </h2>
              <button
                aria-label="Close upload signature dialog"
                className="rounded-md p-1 text-navy transition hover:bg-surface hover:text-brand-accent"
                disabled={isUploading}
                onClick={closeModal}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-7 py-6">
              <div className="rounded-md border border-border bg-surface px-5 py-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy">
                  <Info className="h-4 w-4" />
                  Upload Requirements
                </div>
                <div className="grid gap-3 text-sm font-semibold text-ink sm:grid-cols-2">
                  <RequirementItem label="JPG / PNG*" />
                  <RequirementItem label="Blue signature" />
                  <RequirementItem label="Max. 2 MB" />
                  <RequirementItem label="Ratio: 4:1-5:2" />
                  <RequirementItem label="Min. 300 x 100 px (Recommended: 800 x 300 px+)" />
                </div>
              </div>

              <button
                className={`flex min-h-[220px] w-full flex-col items-center justify-center rounded-md border border-dashed px-6 py-8 text-center transition ${
                  isDragging
                    ? "border-brand-accent bg-surface"
                    : "border-border bg-white hover:border-brand-accent"
                }`}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  const file = event.dataTransfer.files?.[0];

                  if (file) {
                    void selectFile(file);
                  }
                }}
                type="button"
              >
                <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-md bg-surface text-navy">
                  <Plus className="h-8 w-8" />
                </span>
                <span className="text-xl font-bold text-navy">
                  Drag & drop your signature here
                </span>
                <span className="mt-1 text-sm font-semibold text-navy">
                  or locate on your device
                </span>
                <span className="mt-4 rounded-md bg-surface px-5 py-3 text-sm font-bold text-navy">
                  Browse Files
                </span>
                {selectedFile ? (
                  <span className="mt-4 max-w-full truncate text-sm font-bold text-navy">
                    {selectedFile.name}
                  </span>
                ) : null}
              </button>

              <input
                accept=".png,.jpg,image/png,image/jpeg"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";

                  if (file) {
                    void selectFile(file);
                  }
                }}
                ref={fileInputRef}
                type="file"
              />

              {error ? (
                <p className="rounded-md border border-brand-accent bg-surface px-4 py-3 text-sm font-bold text-ink">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-3 border-t border-border bg-surface px-7 py-5">
              <button
                className="h-11 rounded-md border border-border bg-white px-5 text-sm font-bold text-navy shadow-sm transition hover:border-brand-accent hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isUploading}
                onClick={closeModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-11 rounded-md bg-navy px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-accent disabled:cursor-not-allowed disabled:bg-surface disabled:text-navy"
                disabled={isUploading}
                onClick={() => void uploadSelectedFile()}
                type="button"
              >
                {isUploading ? "Uploading..." : "Upload Signature"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RequirementItem({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
      <span>{label}</span>
    </div>
  );
}