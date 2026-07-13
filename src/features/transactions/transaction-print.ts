"use client";

type PrintableAsset = {
  assetModel?: {
    brand?: string | null;
    category?: { name?: string | null } | null;
    name?: string | null;
    typeName?: string | null;
  } | null;
  domain?: { code?: string | null; name?: string | null } | null;
  location?: { name?: string | null } | null;
  locationText?: string | null;
  serialNo?: string | null;
  stockCode?: string | null;
};

export type PrintableTransaction = {
  completedAt?: Date | string | null;
  createdAt?: Date | string;
  documentRef?: string | null;
  dueDate?: Date | string | null;
  id?: string;
  internalRequest?: boolean;
  items?: Array<{ asset?: PrintableAsset | null; requestedQuantity?: number | null }>;
  note?: string | null;
  projectRequest?: boolean;
  purpose?: string | null;
  requestDate?: Date | string | null;
  requestedBy?: {
  email?: string | null;
  name?: string | null;
  signatureDataUrl?: string | null;
} | null;
approvals?: Array<{
  actedAt?: Date | string | null;
  requiredTag?: string | null;
  status?: string | null;
  stepSequence?: number | null;
  user?: {
    email?: string | null;
    name?: string | null;
    signatureDataUrl?: string | null;
  } | null;
}>;
  returnedAt?: Date | string | null;
  serviceRequest?: boolean;
  soldPrice?: string | number | null;
  status?: string;
  transactionNo?: string | null;
  type?: string;
};

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatFormDate(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatFormDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const amount =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  if (Number.isNaN(amount)) {
    return "";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amount);
}

function assetDetail(asset: PrintableAsset | null | undefined) {
  return asset?.assetModel?.name ?? "-";
}

function cell(value: string | number | null | undefined, className = "") {
  return `<span class="cell ${className}">${escapeHtml(value ?? "")}</span>`;
}

function flag(checked: boolean | undefined, label: string) {
  return `
    <span class="flag">
      <span class="checkbox">${checked ? "&#10003;" : ""}</span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function requestFlags(transaction: PrintableTransaction) {
  return [
    flag(transaction.internalRequest, "Internal"),
    flag(transaction.serviceRequest, "Service"),
    flag(transaction.projectRequest, "Project"),
  ].join("");
}

function emptyRow(columns: number) {
  return `<tr>${Array.from({ length: columns }, () => "<td>&nbsp;</td>").join("")}</tr>`;
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks.length > 0 ? chunks : [[]];
}

function pageTransaction(
  transaction: PrintableTransaction,
  items: PrintableTransaction["items"],
) {
  return {
    ...transaction,
    items,
  };
}

function filledRows(
  transaction: PrintableTransaction,
  options: {
    columns: number;
    minRows: number;
    row: (
      asset: PrintableAsset,
      index: number,
      item: NonNullable<PrintableTransaction["items"]>[number],
    ) => string;
  },
) {
  const items = transaction.items ?? [];
  const rowCount = Math.max(options.minRows, items.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const asset = items[index]?.asset;
    const item = items[index];
    return asset && item ? options.row(asset, index, item) : emptyRow(options.columns);
  }).join("");
}

function borrowRows(transaction: PrintableTransaction) {
  return filledRows(transaction, {
    columns: 7,
    minRows: 10,
    row: (asset, index, item) => `
      <tr>
        <td class="center">${cell(index + 1)}</td>
        <td>${cell(asset.assetModel?.brand)}</td>
        <td>${cell(asset.stockCode)}</td>
        <td>${cell(assetDetail(asset))}</td>
        <td>${cell(asset.serialNo)}</td>
        <td class="center">${cell(item.requestedQuantity ?? 1)}</td>
        <td>${cell("")}</td>
      </tr>
    `,
  });
}

function soldRows(transaction: PrintableTransaction) {
  const price = formatMoney(transaction.soldPrice);
  const soldDate = formatFormDate(transaction.requestDate ?? transaction.createdAt);
  const quantityTotal =
    transaction.items?.reduce(
      (totalQuantity, item) => totalQuantity + (item.requestedQuantity ?? 1),
      0,
    ) ?? 0;
  const total = price && quantityTotal
    ? formatMoney(Number(price.replaceAll(",", "")) * quantityTotal)
    : "";

  return {
    rows: filledRows(transaction, {
      columns: 10,
      minRows: 8,
      row: (asset, index, item) => `
        <tr>
          <td class="center">${cell(index + 1)}</td>
          <td>${cell(asset.stockCode)}</td>
          <td>${cell(assetDetail(asset))}</td>
          <td>${cell(asset.serialNo)}</td>
          <td class="center">${cell(item.requestedQuantity ?? 1)}</td>
          <td class="center">${cell("")}</td>
          <td>${cell(soldDate)}</td>
          <td class="right">${cell(price)}</td>
          <td class="right">${cell(
            price
              ? formatMoney(
                  Number(price.replaceAll(",", "")) * (item.requestedQuantity ?? 1),
                )
              : "",
          )}</td>
          <td>${cell("")}</td>
        </tr>
      `,
    }),
    total,
  };
}

function signature(
  title: string,
  role: string,
  imageDataUrl?: string | null,
  signedAt?: Date | string | null,
) {
  const image = imageDataUrl
    ? `<img alt="Signature" class="signature-image" src="${escapeHtml(imageDataUrl)}" />`
    : "";

  return `
    <div class="signature">
      <span class="signature-label">${escapeHtml(title)}</span>
      <span class="signature-line"></span>
      ${image}
      <div class="signature-role">${escapeHtml(role)}</div>
      <div class="signature-date">Date : ${escapeHtml(formatFormDateTime(signedAt))}</div>
    </div>
  `;
}

function metaBox(className: string, label: string, value: string | null | undefined) {
  return `
    <div class="meta-box ${className}">
      <span class="meta-label">${escapeHtml(label)} :</span>
      <span class="meta-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function borrowTable(transaction: PrintableTransaction, isSold: boolean) {
  return `
    <div class="section-title borrow-title">รายการอุปกรณ์ (เบิก/ยืม) :</div>
    <table class="borrow-table form-table">
      <colgroup>
        <col style="width: 18pt" />
        <col style="width: 44pt" />
        <col style="width: 58pt" />
        <col style="width: 182pt" />
        <col style="width: 88pt" />
        <col style="width: 38pt" />
        <col style="width: 92pt" />
      </colgroup>
      <thead>
        <tr>
          <th>No.</th>
          <th>Brand</th>
          <th>Stock Code No.</th>
          <th>Details</th>
          <th>Serial No.</th>
          <th>Q'ty</th>
          <th>Remark</th>
        </tr>
      </thead>
      <tbody>
        ${isSold ? Array.from({ length: 10 }, () => emptyRow(7)).join("") : borrowRows(transaction)}
      </tbody>
    </table>
  `;
}

function soldTable(transaction: PrintableTransaction, isSold: boolean) {
  const sold = soldRows(transaction);

  return `
    <div class="section-title sold-title">รายการอุปกรณ์ (ขาย/คืน) :</div>
    <table class="sold-table form-table">
      <colgroup>
        <col style="width: 18pt" />
        <col style="width: 64pt" />
        <col style="width: 159pt" />
        <col style="width: 80pt" />
        <col style="width: 28pt" />
        <col style="width: 34pt" />
        <col style="width: 37pt" />
        <col style="width: 39pt" />
        <col style="width: 39pt" />
        <col style="width: 22pt" />
      </colgroup>
      <thead>
        <tr>
          <th>No.</th>
          <th>Stock Code No.</th>
          <th>Details</th>
          <th>Serial No.</th>
          <th>Use</th>
          <th>Q'ty<br />Return</th>
          <th>Date</th>
          <th>Price</th>
          <th>Total</th>
          <th>Remark</th>
        </tr>
      </thead>
      <tbody>
        ${isSold ? sold.rows : Array.from({ length: 8 }, () => emptyRow(10)).join("")}
      </tbody>
      ${
        isSold
          ? `<tfoot><tr><td colspan="8" class="right total-label">Total</td><td class="right">${escapeHtml(sold.total)}</td><td></td></tr></tfoot>`
          : ""
      }
    </table>
  `;
}

function documentStyles() {
  return `
    <style>
      @page { margin: 0; size: A4 portrait; }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #fff; }
      body {
        color: #000;
        font-family: "Browallia New", BrowalliaUPC, Arial, sans-serif;
        font-size: 8pt;
        line-height: 1;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        position: relative;
        width: 595pt;
        height: 842pt;
        overflow: hidden;
        background: #fff;
        page-break-after: always;
      }
      .page:last-child {
        page-break-after: auto;
      }
      .logo {
        position: absolute;
        left: 53pt;
        top: 29pt;
        width: 52pt;
        height: 44pt;
        border: 1pt solid #cfcfcf;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #111;
        font: 700 12pt Calibri, Arial, sans-serif;
        transform: rotate(-8deg);
      }
      .company-en,
      .company-th {
        position: absolute;
        left: 110pt;
        font-family: "Angsana New", AngsanaUPC, "Times New Roman", serif;
        font-weight: 700;
        letter-spacing: 0;
        white-space: nowrap;
      }
      .company-en { top: 39pt; font-size: 17pt; }
      .company-th { top: 62pt; font-size: 16.5pt; }
      .form-title {
        position: absolute;
        left: 370pt;
        top: 36pt;
        width: 196pt;
        height: 36pt;
        border-radius: 7pt;
        background: #29558d;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 700 18pt Calibri, Arial, sans-serif;
      }
      .meta-box {
        position: absolute;
        height: 24pt;
        border-radius: 4pt;
        background: #dce8f5;
        display: flex;
        align-items: center;
        gap: 4pt;
        padding: 2pt 8pt;
        overflow: hidden;
      }
      .customer { left: 53pt; top: 86pt; width: 314pt; }
      .req-no { left: 372pt; top: 86pt; width: 194pt; }
      .description { left: 53pt; top: 114pt; width: 314pt; }
      .flags {
        left: 372pt;
        top: 114pt;
        width: 194pt;
        justify-content: space-around;
        padding: 2pt 6pt;
      }
      .meta-label,
      .flag,
      th {
        font-family: Calibri, Arial, sans-serif;
        font-weight: 700;
      }
      .meta-label { flex: 0 0 auto; font-size: 7.5pt; }
      .meta-value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 8.5pt;
        font-weight: 700;
      }
      .flag {
        display: inline-flex;
        align-items: center;
        gap: 4pt;
        font-size: 7.3pt;
      }
      .checkbox {
        width: 8pt;
        height: 8pt;
        border: 1pt solid #333;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 7pt;
        line-height: 1;
      }
      .section-title {
        position: absolute;
        left: 47pt;
        font-size: 9.2pt;
        font-weight: 700;
      }
      .borrow-title { top: 137pt; }
      .sold-title { top: 454pt; }
      .form-table {
        position: absolute;
        left: 47pt;
        width: 520pt;
        border-collapse: collapse;
        table-layout: fixed;
        font-family: "Browallia New", BrowalliaUPC, Arial, sans-serif;
        font-size: 7.2pt;
        line-height: 0.94;
      }
      .borrow-table { top: 148pt; }
      .sold-table { top: 470pt; }
      th,
      td {
        height: 17pt;
        border: 0.75pt solid #000;
        padding: 1pt 3pt;
        vertical-align: middle;
      }
      th {
        height: 17pt;
        border-color: #222;
        border-top-width: 1.2pt;
        border-bottom: 2pt solid #29558d;
        background: #d9d9d9;
        font-size: 6.7pt;
        font-style: italic;
        text-align: center;
      }
      td.center { text-align: center; }
      td.right { text-align: right; }
      .cell {
        display: block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .signature {
        width: 160pt;
        min-height: 42pt;
        font-size: 7.4pt;
      }
      .signature-label { display: inline-block; width: 62pt; }
      .signature-image {
        position: absolute;
        left: 62pt;
        top: -9pt;
        width: 92pt;
        height: 28pt;
        object-fit: contain;
      }
      .signature-line {
        display: inline-block;
        width: 108pt;
        border-bottom: 1pt solid #777;
        transform: translateY(-2pt);
      }
      .signature-role { margin: 5pt 0 0 58pt; }
      .signature-date { margin: 4pt 0 0 64pt; }
      .sig-a,
      .sig-b,
      .sig-c,
      .sig-d,
      .sig-e,
      .sig-f,
      .sig-g,
      .sig-h { position: absolute; }
      .sig-a { left: 70pt; top: 360pt; }
      .sig-b { left: 395pt; top: 360pt; }
      .sig-c { left: 74pt; top: 425pt; }
      .sig-d { left: 398pt; top: 425pt; }
      .sig-e { left: 70pt; top: 692pt; }
      .sig-f { left: 395pt; top: 692pt; }
      .sig-g { left: 74pt; top: 756pt; }
      .sig-h { left: 398pt; top: 756pt; }
      tfoot td { height: 15pt; font-weight: 700; }
      .total-label { font-family: Calibri, Arial, sans-serif; }
      .footer-code {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 8pt;
        text-align: center;
        font-size: 7pt;
      }
      @media screen {
        body { background: #444; padding: 18px; }
        .page { margin: 0 auto; box-shadow: 0 2px 20px rgba(0,0,0,.25); }
      }
    </style>
  `;
}

function buildDocument(transaction: PrintableTransaction) {
  const isSold = transaction.type === "SOLD";
  const referenceNo = transaction.transactionNo ?? transaction.id ?? "-";
  const itemChunks = chunkItems(transaction.items ?? [], isSold ? 8 : 10);
  const pages = itemChunks
    .map((items, pageIndex) =>
      buildPage(pageTransaction(transaction, items), {
        isSold,
        pageIndex,
        pageTotal: itemChunks.length,
        referenceNo,
      }),
    )
    .join("");

  return `<!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(referenceNo)}</title>
        ${documentStyles()}
      </head>
      <body>
        ${pages}
      </body>
    </html>`;
}

function pageSuffix(pageIndex: number, pageTotal: number) {
  return pageTotal > 1 ? ` (${pageIndex + 1}/${pageTotal})` : "";
}

function approvedSignature(
  transaction: PrintableTransaction,
  matchesRequiredTag: (requiredTag: string) => boolean,
) {
  const approvals = transaction.approvals?.filter(
    (item) =>
      item.status === "APPROVED" &&
      matchesRequiredTag(item.requiredTag ?? ""),
  ) ?? [];
  const approval = approvals.at(-1);

  return {
    signedAt: approval?.actedAt ?? null,
    signatureDataUrl: approval?.user?.signatureDataUrl ?? null,
  };
}

function isBusinessOrProjectApproval(requiredTag: string) {
  return (
    requiredTag === "LEAD_PROJECT" ||
    (!requiredTag.startsWith("STOCK_CONTROLLER:") && !requiredTag.startsWith("BSD_"))
  );
}

function buildPage(
  transaction: PrintableTransaction,
  options: {
    isSold: boolean;
    pageIndex: number;
    pageTotal: number;
    referenceNo: string;
  },
) {
  const referenceNo = `${options.referenceNo}${pageSuffix(
    options.pageIndex,
    options.pageTotal,
  )}`;
  const requesterSignature = {
    signedAt: transaction.requestDate ?? transaction.createdAt ?? null,
    signatureDataUrl: transaction.requestedBy?.signatureDataUrl ?? null,
  };
  const projectSignature = approvedSignature(
    transaction,
    (requiredTag) => isBusinessOrProjectApproval(requiredTag),
  );
  const stockSignature = approvedSignature(
    transaction,
    (requiredTag) => requiredTag.startsWith("STOCK_CONTROLLER:"),
  );
  const bsdSignature = approvedSignature(
    transaction,
    (requiredTag) => requiredTag.startsWith("BSD_"),
  );

  return `
    <main class="page">
      <div class="logo">JZ</div>
      <div class="company-en">JZ Computer and Consultant Ltd., Part.</div>
      <div class="company-th">หจก. เจซี คอมพิวเตอร์ แอนด์ คอนซัลแทนส์</div>
      <div class="form-title">ใบเบิก-ยืม-คืนอุปกรณ์</div>

      ${metaBox("customer", "Customer Name", transaction.purpose)}
      ${metaBox("req-no", "Requisition No.", referenceNo)}
      ${metaBox("description", "Description", transaction.note)}
      <div class="meta-box flags">${requestFlags(transaction)}</div>

      ${borrowTable(transaction, options.isSold)}
      <div class="sig-a">${signature("Requisition by :", "(____________________)", requesterSignature.signatureDataUrl, requesterSignature.signedAt)}</div>
      <div class="sig-b">${signature("Requisition by :", "Lead of Project/Job", projectSignature.signatureDataUrl, projectSignature.signedAt)}</div>
      <div class="sig-c">${signature("Inspector by :", "(Stock control)", stockSignature.signatureDataUrl, stockSignature.signedAt)}</div>
      <div class="sig-d">${signature("Inspector by :", "(BSD)", bsdSignature.signatureDataUrl, bsdSignature.signedAt)}</div>

      ${soldTable(transaction, options.isSold)}
      <div class="sig-e">${signature("Requisition by :", "(____________________)", requesterSignature.signatureDataUrl, requesterSignature.signedAt)}</div>
      <div class="sig-f">${signature("Requisition by :", "Lead of Project/Job", projectSignature.signatureDataUrl, projectSignature.signedAt)}</div>
      <div class="sig-g">${signature("Inspector by :", "(Stock control)", stockSignature.signatureDataUrl, stockSignature.signedAt)}</div>
      <div class="sig-h">${signature("Inspector by :", "(BSD)", bsdSignature.signatureDataUrl, bsdSignature.signedAt)}</div>
      <div class="footer-code">FM-5300(2)-R.5</div>
    </main>
  `;
}
export function openTransactionPrintWindow() {
  const popup = window.open("", "_blank", "height=900,width=1100");

  if (popup) {
    popup.document.open();
    popup.document.write(`<!doctype html>
      <html>
        <head>
          <title>Preparing PDF</title>
          <style>
            body {
              align-items: center;
              background: #efeeea;
              color: #273f4f;
              display: flex;
              font-family: Calibri, Arial, sans-serif;
              font-size: 16px;
              font-weight: 700;
              height: 100vh;
              justify-content: center;
              margin: 0;
            }
          </style>
        </head>
        <body>Preparing PDF form...</body>
      </html>`);
    popup.document.close();
  }

  return popup;
}

export function printTransaction(
  transaction: PrintableTransaction,
  targetWindow?: Window | null,
) {
  const popup = targetWindow ?? openTransactionPrintWindow();

  if (!popup) {
    window.print();
    return;
  }

  popup.document.open();
  popup.document.write(buildDocument(transaction));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 450);
}

