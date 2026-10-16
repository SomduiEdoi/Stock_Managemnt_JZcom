import {
  buildTransactionDocumentHtml,
  type TransactionDocumentFontUrls,
} from "@/features/transactions/transaction-document";
import { renderDocumentPdf } from "@/lib/transaction-pdf";

export type DamagePdfItem = {
  model: string;
  description?: string | null;
  stockCode?: string | null;
  serialNo?: string | null;
  quantity: number;
  outcome: "FAIL" | "LOST" | "USED";
  note?: string | null;
};

export type DamagePdfSignature = {
  name: string;
  signatureDataUrl?: string | null;
  date?: Date | string | null;
};

export type DamagePdfInput = {
  requestNo: string;
  sourceRequestNo: string;
  projectName: string;
  requesterName: string;
  internalRequest?: boolean;
  serviceRequest?: boolean;
  projectRequest?: boolean;
  items: DamagePdfItem[];
  signatures: {
    requester: DamagePdfSignature[];
    lead: DamagePdfSignature[];
    storeman: DamagePdfSignature[];
  };
};

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function signatureCard(signature: DamagePdfSignature) {
  const date = signature.date ? new Date(signature.date) : null;
  const displayDate =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          timeZone: "Asia/Bangkok",
        }).format(date)
      : "";
  // Only inline raster snapshots are accepted; no network or local-file loads.
  const image =
    signature.signatureDataUrl &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(
      signature.signatureDataUrl,
    )
      ? `<img alt="Signature" class="signature-image" src="${escapeHtml(signature.signatureDataUrl)}" />`
      : "";
  return `<div class="signature-item">
    <div class="signature-line"><span class="signature-images">${image}</span></div>
    <div class="signature-user">( ${escapeHtml(signature.name)} )</div>
    <div class="signature-date">Date : ${escapeHtml(displayDate)}</div>
  </div>`;
}

function signatureColumn(title: string, entries: DamagePdfSignature[]) {
  const cards = entries.length ? entries : [{ name: "" }];
  return `<div class="signature"><div class="signature-label">${title}</div>
    <div class="signature-items">${cards.map(signatureCard).join("")}</div></div>`;
}

function table(items: DamagePdfItem[], offset: number) {
  const headers = [
    "No.",
    "Model",
    "Description",
    "Stock Code No.",
    "Serial No.",
    "QTY",
    "Outcome",
    "Note",
  ];
  const widths = [5, 13, 18, 15, 15, 5, 9, 20];
  return `<table class="items-table damage">
    <colgroup>${widths.map((width) => `<col style="width:${width}%" />`).join("")}</colgroup>
    <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
    <tbody>${items
      .map(
        (item, index) =>
          `<tr>${[
            offset + index + 1,
            item.model,
            item.description,
            item.stockCode,
            item.serialNo,
            item.quantity,
            item.outcome,
            item.note,
          ]
            .map((cell) => `<td>${escapeHtml(cell)}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

export function buildDamageDocumentHtml(
  input: DamagePdfInput,
  fontUrls: TransactionDocumentFontUrls = {},
): string {
  const items = input.items.filter(
    (item) =>
      item.outcome === "FAIL" ||
      item.outcome === "LOST" ||
      item.outcome === "USED",
  );
  if (!items.length) {
    throw new Error(
      "Damage PDF requires at least one FAIL, LOST or USED item.",
    );
  }
  if (
    items.some(
      (item) => !Number.isSafeInteger(item.quantity) || item.quantity <= 0,
    )
  ) {
    throw new Error("Damage PDF quantities must be positive safe integers.");
  }
  const requester = input.signatures.requester.length
    ? input.signatures.requester
    : [{ name: input.requesterName }];
  // Keep signature rows bounded independently of item pagination.
  const pageCount = Math.max(
    Math.ceil(items.length / 10),
    Math.ceil(requester.length / 3),
    Math.ceil(input.signatures.lead.length / 3),
    Math.ceil(input.signatures.storeman.length / 6),
  );
  let html = buildTransactionDocumentHtml(
    {
      transactionNo: input.requestNo,
      status: "RETURNED",
      sourceTransactionId: input.sourceRequestNo,
      internalRequest: input.internalRequest,
      serviceRequest: input.serviceRequest,
      projectRequest: input.projectRequest,
      purpose: input.projectName,
      note: `Source Request / คำขอเบิกต้นทาง : ${input.sourceRequestNo}`,
      requestedBy: { name: input.requesterName },
      items: Array.from({ length: pageCount * 10 }, () => ({})),
    },
    fontUrls,
  );
  let tableIndex = 0;
  let signatureIndex = 0;
  // Adapt only the known template slots, keeping the shared JZ layout and fonts.
  html = html
    .replaceAll("ใบคืน อุปกรณ์", "ใบแจ้งสภาพอุปกรณ์ / Condition Report")
    .replaceAll("รายการอุปกรณ์ (คืน) :", "รายการอุปกรณ์ / FAIL, LOST, USED :")
    .replace(/<table class="items-table return">[\s\S]*?<\/table>/g, () => {
      const offset = tableIndex++ * 10;
      return table(items.slice(offset, offset + 10), offset);
    })
    .replace(
      /<section class="signatures signatures-four">[\s\S]*?<\/section>/g,
      () => {
        const index = signatureIndex++;
        return `<section class="signatures signatures-four damage-signatures">
        ${signatureColumn("Requisition by / ผู้ขอ :", requester.slice(index * 3, index * 3 + 3))}
        ${signatureColumn("Lead Project / Supervisor :", input.signatures.lead.slice(index * 3, index * 3 + 3))}
        ${signatureColumn("Storeman / ผู้ดูแลคลัง :", input.signatures.storeman.slice(index * 6, index * 6 + 6))}
        ${signatureColumn("Executive Authorized by / ผู้บริหาร :", [{ name: "" }])}
      </section>`;
      },
    );
  if (tableIndex !== pageCount || signatureIndex !== pageCount) {
    throw new Error(
      "Transaction document template is incompatible with damage PDF slots.",
    );
  }
  return html.replace(
    "</head>",
    `<style>
    .form-title { font-family: "ThaiPdf", "Leelawadee UI", Arial, sans-serif; font-size: 11pt; white-space: normal; }
    .items-table.damage th, .items-table.damage td { white-space: normal; overflow-wrap: anywhere; text-overflow: clip; font-size: 7pt; line-height: 1.2; }
    .damage-signatures { grid-template-columns: 22fr 28fr 50fr; }
    .damage-signatures .signature-items { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10pt; }
    .damage-signatures .signature:nth-child(3) .signature-items { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .damage-signatures .signature-item { min-width: 0; width: 100%; }
  </style></head>`,
  );
}

export async function buildDamagePdf(input: DamagePdfInput): Promise<Buffer> {
  // Validate before launching Chrome, including batches containing no reportable outcomes.
  buildDamageDocumentHtml(input);
  return renderDocumentPdf((fontUrls) =>
    buildDamageDocumentHtml(input, fontUrls),
  );
}
