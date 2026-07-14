"use client";

export async function downloadTransactionPdf(transactionId: string) {
  const response = await fetch(`/api/transactions/${transactionId}/pdf`);

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    throw new Error(data.message ?? "Unable to export PDF.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const fileNameMatch = disposition?.match(/filename="([^"]+)"/);
  const fileName = fileNameMatch?.[1] ?? `${transactionId}.pdf`;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
