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
  items?: Array<{ asset?: PrintableAsset | null }>;
  note?: string | null;
  projectRequest?: boolean;
  purpose?: string | null;
  requestedBy?: { email?: string | null; name?: string | null } | null;
  returnedAt?: Date | string | null;
  serviceRequest?: boolean;
  soldPrice?: string | number | null;
  status?: string;
  transactionNo?: string | null;
  type?: string;
};

function escapeHtml(value: string | null | undefined) {
  return (value ?? "-")
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

  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function assetDetails(asset: PrintableAsset | null | undefined) {
  return asset?.assetModel?.name ?? "-";
}

function cell(value: string | number | null | undefined, className = "") {
  return `<span class="cell ${className}">${escapeHtml(String(value ?? ""))}</span>`;
}

function buildRequestFlags(transaction: PrintableTransaction) {
  const flags = [
    { checked: transaction.internalRequest, label: "Internal" },
    { checked: transaction.serviceRequest, label: "Service" },
    { checked: transaction.projectRequest, label: "Project" },
  ];

  return flags
    .map(
      ({ checked, label }) => `
        <span class="flag">
          <span class="checkbox">${checked ? "&#10003;" : ""}</span>
          <span>${label}</span>
        </span>
      `,
    )
    .join("");
}

function buildEmptyRow(columnCount: number) {
  return `
    <tr>
      ${Array.from({ length: columnCount }, () => "<td>&nbsp;</td>").join("")}
    </tr>
  `;
}

function buildFilledRows(
  transaction: PrintableTransaction,
  options: {
    blankRows: number;
    columnCount: number;
    buildRow: (asset: PrintableAsset | null, index: number) => string;
  },
) {
  const items = transaction.items ?? [];
  const rowCount = Math.max(options.blankRows, items.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const asset = items[index]?.asset ?? null;

    return asset ? options.buildRow(asset, index) : buildEmptyRow(options.columnCount);
  }).join("");
}

function buildBorrowRows(transaction: PrintableTransaction) {
  return buildFilledRows(transaction, {
    blankRows: 9,
    columnCount: 7,
    buildRow: (asset, index) => `
      <tr>
        <td class="center">${cell(index + 1)}</td>
        <td>${cell(asset?.assetModel?.brand)}</td>
        <td>${cell(asset?.stockCode)}</td>
        <td>${cell(assetDetails(asset))}</td>
        <td>${cell(asset?.serialNo)}</td>
        <td class="center">${cell("1")}</td>
        <td></td>
      </tr>
    `,
  });
}

function buildSoldRows(transaction: PrintableTransaction) {
  const price = formatMoney(transaction.soldPrice);
  const items = transaction.items ?? [];
  const total = price
    ? formatMoney(Number.parseFloat(price.replaceAll(",", "")) * items.length)
    : "";
  const soldDate = formatFormDate(transaction.completedAt ?? transaction.createdAt);

  return {
    rows: buildFilledRows(transaction, {
      blankRows: 8,
      columnCount: 10,
      buildRow: (asset, index) => `
        <tr>
          <td class="center">${cell(index + 1)}</td>
          <td>${cell(asset?.stockCode)}</td>
          <td>${cell(assetDetails(asset))}</td>
          <td>${cell(asset?.serialNo)}</td>
          <td class="center">${cell("Sold")}</td>
          <td class="center">${cell("1")}</td>
          <td>${cell(soldDate)}</td>
          <td class="right">${cell(price)}</td>
          <td class="right">${cell(price)}</td>
          <td></td>
        </tr>
      `,
    }),
    total,
  };
}

function signatureBlock(title: string, subtitle: string) {
  return `
    <div class="signature-block">
      <div class="signature-line">${escapeHtml(title)}</div>
      <div class="signature-subtitle">${escapeHtml(subtitle)}</div>
      <div class="signature-date">Date: ____________________</div>
    </div>
  `;
}

function buildDocument(transaction: PrintableTransaction) {
  const requesterName =
    transaction.type === "USING" ? "Staff Name" : "Customer Name";
  const requesterValue = transaction.purpose ?? "-";
  const referenceNo = transaction.transactionNo ?? transaction.id ?? "-";
  const isSold = transaction.type === "SOLD";
  const soldRows = buildSoldRows(transaction);

  return `<!doctype html>
  <html lang="th">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(referenceNo)}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #fff;
          color: #000;
          font-family: "Browallia New", BrowalliaUPC, Arial, sans-serif;
          font-size: 3mm;
          line-height: 1.02;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 9mm 13mm 7mm;
        }

        .header {
          display: grid;
          grid-template-columns: 1fr 92mm;
          align-items: center;
          gap: 7mm;
          margin-bottom: 2.8mm;
        }

        .company {
          display: flex;
          align-items: center;
          gap: 3.5mm;
        }

        .logo {
          width: 18mm;
          height: 18mm;
          border: 0.25mm solid #b8b8b8;
          border-radius: 50%;
          color: #273f4f;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Calibri, Arial, sans-serif;
          font-size: 4.6mm;
          font-weight: 700;
        }

        .company-text,
        .company-sub {
          font-family: "Angsana New", AngsanaUPC, "Times New Roman", serif;
          font-weight: 700;
          letter-spacing: 0;
        }

        .company-text {
          font-size: 5mm;
          line-height: 0.9;
        }

        .company-sub {
          font-size: 4.5mm;
          line-height: 0.9;
          margin-top: 0.4mm;
        }

        .form-title {
          justify-self: end;
          width: 100%;
          background: #273f4f;
          border-radius: 3mm;
          color: #fff;
          font-family: Calibri, Arial, sans-serif;
          font-size: 6mm;
          font-weight: 700;
          letter-spacing: 0;
          padding: 4.2mm 7mm;
          text-align: center;
        }

        .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.8mm;
          margin-bottom: 2.4mm;
        }

        .meta-block {
          min-height: 8.4mm;
          background: #dde7f3;
          border-radius: 2mm;
          display: flex;
          align-items: center;
          gap: 1.6mm;
          padding: 1.6mm 2.4mm;
        }

        .meta-label,
        .flag,
        th {
          font-family: Calibri, Arial, sans-serif;
        }

        .meta-label {
          font-size: 2.8mm;
          font-weight: 700;
          white-space: nowrap;
        }

        .meta-value {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          font-size: 3mm;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .full {
          grid-column: 1 / -1;
        }

        .checkboxes {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4mm;
          width: 100%;
        }

        .flag {
          display: inline-flex;
          align-items: center;
          gap: 1.2mm;
          font-size: 2.8mm;
          font-weight: 700;
          white-space: nowrap;
        }

        .checkbox {
          width: 3.6mm;
          height: 3.6mm;
          border: 0.3mm solid #111;
          border-radius: 0.7mm;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 2.45mm;
          line-height: 1;
        }

        .section-title {
          margin: 2.1mm 0 1mm;
          font-size: 3.4mm;
          font-weight: 700;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 2.65mm;
          line-height: 0.95;
        }

        th,
        td {
          height: 6.1mm;
          border: 0.25mm solid #6a6a6a;
          padding: 0.55mm 0.9mm;
          vertical-align: middle;
        }

        th {
          height: 5.1mm;
          background: #d9d9d9;
          font-size: 2.35mm;
          font-weight: 700;
          text-align: center;
        }

        td.center {
          text-align: center;
        }

        td.right {
          text-align: right;
        }

        .cell {
          display: block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4.8mm 9mm;
          margin-top: 4mm;
        }

        .signature-block {
          min-height: 12.5mm;
          padding-top: 2.4mm;
        }

        .signature-line {
          min-height: 5.2mm;
          border-top: 0.25mm solid #555;
          font-size: 2.9mm;
          font-weight: 700;
          padding-top: 1.1mm;
        }

        .signature-subtitle,
        .signature-date {
          font-size: 2.55mm;
          margin-top: 0.5mm;
        }

        .footer-code {
          margin-top: 2.5mm;
          font-size: 2.45mm;
          text-align: center;
        }

        .spacer {
          height: 1.4mm;
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="header">
          <div class="company">
            <div class="logo">JZ</div>
            <div>
              <div class="company-text">JZ Computer and Consultant Ltd., Part.</div>
              <div class="company-sub">หจก. เจซี คอมพิวเตอร์ แอนด์ คอนซัลแทนส์</div>
            </div>
          </div>
          <div class="form-title">ใบเบิก-ยืม-คืนอุปกรณ์</div>
        </section>

        <section class="meta-grid">
          <div class="meta-block">
            <div class="meta-label">${escapeHtml(requesterName)} :</div>
            <div class="meta-value">${escapeHtml(requesterValue)}</div>
          </div>
          <div class="meta-block">
            <div class="meta-label">Requisition No. :</div>
            <div class="meta-value">${escapeHtml(referenceNo)}</div>
          </div>
          <div class="meta-block full">
            <div class="meta-label">Description :</div>
            <div class="meta-value">${escapeHtml(transaction.note)}</div>
            <div class="checkboxes">${buildRequestFlags(transaction)}</div>
          </div>
        </section>

        <section>
          <div class="section-title">รายการอุปกรณ์ (เบิก/ยืม) :</div>
          <table>
            <colgroup>
              <col style="width: 5%">
              <col style="width: 10%">
              <col style="width: 11%">
              <col style="width: 34%">
              <col style="width: 17%">
              <col style="width: 7%">
              <col style="width: 16%">
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
              ${
                isSold
                  ? Array.from({ length: 9 }, () => buildEmptyRow(7)).join("")
                  : buildBorrowRows(transaction)
              }
            </tbody>
          </table>
        </section>

        <section class="signatures">
          ${signatureBlock("Requisition by :", "(____________________)")}
          ${signatureBlock("Requisition by :", "Lead of Project/Job")}
          ${signatureBlock("Inspector by :", "(Stock control)")}
          ${signatureBlock("Inspector by :", "(BSD)")}
        </section>

        <div class="spacer"></div>

        <section>
          <div class="section-title">รายการอุปกรณ์ (ขาย/คืน) :</div>
          <table>
            <colgroup>
              <col style="width: 4%">
              <col style="width: 10%">
              <col style="width: 23%">
              <col style="width: 14%">
              <col style="width: 8%">
              <col style="width: 8%">
              <col style="width: 12%">
              <col style="width: 8%">
              <col style="width: 8%">
              <col style="width: 5%">
            </colgroup>
            <thead>
              <tr>
                <th>No.</th>
                <th>Stock Code No.</th>
                <th>Details</th>
                <th>Serial No.</th>
                <th>Use</th>
                <th>Qty Return</th>
                <th>Date</th>
                <th>Price</th>
                <th>Total</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              ${
                isSold
                  ? soldRows.rows
                  : Array.from({ length: 8 }, () => buildEmptyRow(10)).join("")
              }
            </tbody>
            ${
              isSold
                ? `<tfoot>
                    <tr>
                      <td colspan="8" class="right" style="font-weight:700;">Total</td>
                      <td class="right" style="font-weight:700;">${escapeHtml(soldRows.total)}</td>
                      <td></td>
                    </tr>
                  </tfoot>`
                : ""
            }
          </table>
        </section>

        <section class="signatures">
          ${signatureBlock("Requisition by :", "(____________________)")}
          ${signatureBlock("Requisition by :", "Lead of Project/Job")}
          ${signatureBlock("Inspector by :", "(Stock control)")}
          ${signatureBlock("Inspector by :", "(BSD)")}
        </section>

        <div class="footer-code">FM-5300(2)-R.5</div>
      </main>
    </body>
  </html>`;
}

export function printTransaction(transaction: PrintableTransaction) {
  const popup = window.open("", "_blank", "height=900,width=1100");

  if (!popup) {
    window.print();
    return;
  }

  popup.document.open();
  popup.document.write(buildDocument(transaction));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 300);
}
