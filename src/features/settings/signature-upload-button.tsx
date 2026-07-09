"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type SignatureUploadButtonProps = {
  hasSignature: boolean;
};

const maxSignatureBytes = 2 * 1024 * 1024;

function validateFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (file.size > maxSignatureBytes) {
    return "Maximum file size is 2 MB.";
  }

  if (extension !== "png" && extension !== "jpg") {
    return "Only PNG or JPG signature files are allowed.";
  }

  if (extension === "jpg" && file.type !== "image/jpeg" && file.type !== "image/jpg") {
    return "Only PNG or JPG signature files are allowed.";
  }

  if (extension === "png" && file.type !== "image/png") {
    return "Only PNG or JPG signature files are allowed.";
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

  async function uploadFile(file: File) {
    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.set("signature", file);

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
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        <Upload className="h-4 w-4" />
        {isUploading
          ? "Uploading..."
          : hasSignature
            ? "Change Signature"
            : "Upload Signature"}
      </button>
      <input
        accept=".png,.jpg,image/png,image/jpg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (file) {
            void uploadFile(file);
          }
        }}
        ref={fileInputRef}
        type="file"
      />
      {error ? (
        <p className="text-sm font-semibold text-status-fail">{error}</p>
      ) : null}
    </div>
  );
}
