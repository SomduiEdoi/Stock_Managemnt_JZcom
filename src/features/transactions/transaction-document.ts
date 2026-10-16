import { formatProjectLabel } from "@/lib/project-label";
import { readStoredSalePriceGroups } from "@/lib/sale-price-groups-schema";

export type PrintableAsset = {
  isSerialized?: boolean | null;
  assetModel?: {
    isSerialized?: boolean;
    brand?: string | null;
    category?: { name?: string | null } | null;
    description?: string | null;
    name?: string | null;
    typeName?: string | null;
  } | null;
  warehouse?: {
    code?: string | null;
    name?: string | null;
  } | null;
  location?: { name?: string | null } | null;
  locationText?: string | null;
  serialNo?: string | null;
  stockCode?: string | null;
};

export type PrintableTransactionItem = {
  asset?: PrintableAsset | null;
  id?: string;
  outcomes?: Array<{ resolutionBatchId?: string | null }>;
  requestedQuantity?: number | null;
  resolutionNote?: string | null;
  resolvedStatus?: string | null;
  soldPrice?: { toString(): string } | number | string | null;
  soldTotal?: { toString(): string } | number | string | null;
  salePriceGroups?: unknown;
  returnedAt?: Date | string | null;
  note?: string | null;
};

export type PrintableTransaction = {
  approvals?: Array<{
    actedAt?: Date | string | null;
    approverSignatureSnapshot?: string | null;
    requiredTag?: string | null;
    resolutionBatchId?: string | null;
    status?: string | null;
    stepSequence?: number | null;
    user?: {
      email?: string | null;
      name?: string | null;
      signatureDataUrl?: string | null;
    } | null;
  }>;
  completedAt?: Date | string | null;
  createdAt?: Date | string;
  documentRef?: string | null;
  dueDate?: Date | string | null;
  id?: string;
  internalRequest?: boolean;
  items?: PrintableTransactionItem[];
  note?: string | null;
  project?: { id?: string | null; name?: string | null; customerName?: string | null; projectId?: string | null } | null;
  projectId?: string | null;
  projectRequest?: boolean;
  purpose?: string | null;
  requestDate?: Date | string | null;
  requestedBy?: {
    email?: string | null;
    name?: string | null;
    signatureDataUrl?: string | null;
  } | null;
  returnedAt?: Date | string | null;
  serviceRequest?: boolean;
  soldPrice?: { toString(): string } | number | string | null;
  sourceTransaction?: {
    documentRef?: string | null;
    id?: string | null;
    transactionNo?: string | null;
  } | null;
  sourceTransactionId?: string | null;
  status?: string;
  transactionNo?: string | null;
  type?: string;
};

type DocumentKind = "BORROW" | "RETURN" | "SALE";
type MoneyValue = { toString(): string } | number | string | null | undefined;

type ExportDocument = {
  approvals: NonNullable<PrintableTransaction["approvals"]>;
  kind: DocumentKind;
  items: PrintableTransactionItem[];
  referenceNo: string;
  showFromReference: boolean;
  transaction: PrintableTransaction;
};

export type TransactionDocumentFontUrls = {
  bold?: string;
  regular?: string;
};

const ROWS_PER_PAGE = {
  BORROW: 10,
  RETURN: 10,
  SALE: 10,
} as const satisfies Record<DocumentKind, number>;

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMoney(value: MoneyValue) {
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

function numberValue(value: MoneyValue) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  return Number.isNaN(parsed) ? 0 : parsed;
}

function chunkItems(items: PrintableTransactionItem[], size: number) {
  const chunks: PrintableTransactionItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks.length > 0 ? chunks : [[]];
}

function transactionNo(transaction: PrintableTransaction) {
  if (
    transaction.type === "SOLD" &&
    transaction.sourceTransactionId &&
    !transaction.transactionNo
  ) {
    return `From ${sourceReference(transaction)}`;
  }

  return transaction.transactionNo ?? transaction.documentRef ?? transaction.id ?? "-";
}

function sourceReference(transaction: PrintableTransaction) {
  return (
    transaction.sourceTransaction?.transactionNo ??
    transaction.sourceTransaction?.documentRef ??
    transaction.documentRef ??
    transaction.transactionNo ??
    transaction.id ??
    "-"
  );
}

function modelName(item: PrintableTransactionItem) {
  return item.asset?.assetModel?.name ?? "-";
}

function stockCode(item: PrintableTransactionItem) {
  return item.asset?.stockCode ?? "-";
}

function serialNo(item: PrintableTransactionItem) {
  return item.asset?.serialNo ?? "-";
}

function descriptionText(item: PrintableTransactionItem) {
  return (
    item.asset?.assetModel?.description ??
    item.asset?.assetModel?.typeName ??
    item.asset?.assetModel?.category?.name ??
    ""
  );
}

function requestFlags(transaction: PrintableTransaction) {
  const flags = [
    { checked: transaction.internalRequest, label: "Internal" },
    { checked: transaction.serviceRequest, label: "Service" },
    { checked: transaction.projectRequest, label: "Project" },
  ];

  return flags
    .map(
      (flag) => `
        <span class="flag">
          <span class="checkbox">${flag.checked ? "✓" : ""}</span>
          <span>${escapeHtml(flag.label)}</span>
        </span>
      `,
    )
    .join("");
}

function approvalsFor(
  transaction: PrintableTransaction,
  matcher: (requiredTag: string) => boolean,
  source = transaction.approvals ?? [],
) {
  return source.filter(
      (approval) =>
        approval.status === "APPROVED" && matcher(approval.requiredTag ?? ""),
    );
}

function leadApprovalMatcher(requiredTag: string) {
  return (
    requiredTag === "LEAD_PROJECT" ||
    (!requiredTag.startsWith("STOREMAN:") &&
      !requiredTag.startsWith("WAREHOUSE_MANAGER:") &&
      !requiredTag.startsWith("BSD_") &&
      !requiredTag.startsWith("ACK_"))
  );
}

function formatSignatureDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function signature(
  title: string,
  options: {
    approvalItems?: NonNullable<PrintableTransaction["approvals"]>;
    date?: Date | string | null;
    dates?: string;
    signatureDataUrl?: string | null;
    signatureHtml?: string;
    userName?: string | null;
  } = {},
) {
  const items = options.approvalItems?.length
    ? options.approvalItems.map((approval) => `
        <div class="signature-item">
          <div class="signature-line"><span class="signature-images">${approval.approverSignatureSnapshot ?? approval.user?.signatureDataUrl
            ? '<img alt="Signature" class="signature-image" src="' + escapeHtml(approval.approverSignatureSnapshot ?? approval.user?.signatureDataUrl) + '" />'
            : ""}</span></div>
          <div class="signature-user">( ${escapeHtml(approval.user?.name)} )</div>
          <div class="signature-date">Date : ${escapeHtml(formatSignatureDate(approval.actedAt))}</div>
        </div>
      `).join("")
    : `
        <div class="signature-item">
          <div class="signature-line"><span class="signature-images">${options.signatureHtml ?? (options.signatureDataUrl
            ? '<img alt="Signature" class="signature-image" src="' + escapeHtml(options.signatureDataUrl) + '" />'
            : "")}</span></div>
          <div class="signature-user">( ${escapeHtml(options.userName)} )</div>
          <div class="signature-date">Date : ${escapeHtml(options.dates ?? formatSignatureDate(options.date))}</div>
        </div>
      `;

  return `
    <div class="signature">
      <div class="signature-label">${escapeHtml(title)}</div>
      <div class="signature-items">${items}</div>
    </div>
  `;
}

function signatures(document: ExportDocument) {
  const { transaction, approvals: sourceApprovals } = document;
  const requester = {
    date: transaction.requestDate ?? transaction.createdAt ?? null,
    signatureDataUrl: transaction.requestedBy?.signatureDataUrl ?? null,
  };
  const lead = approvalsFor(transaction, leadApprovalMatcher, sourceApprovals);
  const stock = approvalsFor(
    transaction,
    (tag) => tag.startsWith("STOREMAN:"),
    sourceApprovals,
  );
  const authorized = approvalsFor(
    transaction,
    (tag) => tag === "BSD_STAFF",
    sourceApprovals,
  );
  const signatureClass = transaction.type === "SOLD" || transaction.status === "RETURNED"
    ? "signatures-four"
    : "signatures-three";
  const authorizedSignature = signatureClass === "signatures-four"
    ? signature("Authorized by :", {
        approvalItems: authorized,
      })
    : "";

  return `
    <section class="signatures ${signatureClass}">
      ${signature("Requisition by :", {
        ...requester,
        dates: formatSignatureDate(requester.date),
        userName: transaction.requestedBy?.name,
      })}
      ${signature("Lead Project / Supervisor :", {
        approvalItems: lead,
      })}
      ${signature("Storeman :", {
        approvalItems: stock,
      })}
      ${authorizedSignature}
    </section>
  `;
}

function warehouseManagerLabel(name: string | null | undefined) {
  const cleanName = name?.trim();
  if (!cleanName) return "Warehouse Manager";
  return /warehouse$/i.test(cleanName)
    ? `${cleanName} Manager`
    : `${cleanName} Warehouse Manager`;
}

function directedBy(transaction: PrintableTransaction) {
  const labels: string[] = [];
  if (approvalsFor(transaction, (tag) => tag === "ACK_BSD").length > 0) {
    labels.push("BSD");
  }
  if (approvalsFor(transaction, (tag) => tag === "ACK_WAREHOUSE_MANAGER").length > 0) {
    const warehouseLabels = Array.from(new Set(
      (transaction.items ?? []).map((item) => warehouseManagerLabel(item.asset?.warehouse?.name)),
    ));
    labels.push(...warehouseLabels);
  }
  return labels.length > 0
    ? `<div class="directed-by">Directed by: ${escapeHtml(labels.join(", "))}</div>`
    : "";
}
function titleFor(kind: DocumentKind) {
  if (kind === "RETURN") {
    return "ใบคืน อุปกรณ์";
  }

  if (kind === "SALE") {
    return "ใบขาย อุปกรณ์";
  }

  return "ใบเบิก-ยืม อุปกรณ์";
}

function sectionTitleFor(kind: DocumentKind) {
  if (kind === "RETURN") {
    return "รายการอุปกรณ์ (คืน) :";
  }

  if (kind === "SALE") {
    return "รายการอุปกรณ์ (ขาย) :";
  }

  return "รายการอุปกรณ์ (เบิก/ยืม) :";
}

function customerName(transaction: PrintableTransaction) {
  if (transaction.projectRequest || transaction.serviceRequest) {
    const customer = transaction.project?.customerName ?? transaction.purpose ?? "-";
    return transaction.project?.name ? formatProjectLabel(transaction.project) : customer;
  }

  return transaction.purpose ?? "-";
}

function header(document: ExportDocument, pageIndex: number, pageTotal: number) {
  const displayReference = document.showFromReference
    ? `from ${document.referenceNo}`
    : document.referenceNo;
  const pageSuffix = pageTotal > 1 ? ` (${pageIndex + 1}/${pageTotal})` : "";

  return `
    <header class="header">
      <div class="brand">
        <div class="logo">JZ</div>
        <div>
          <div class="company-en">JZ Computer and Consultant Ltd., Part.</div>
          <div class="company-th">หจก. เจซี คอมพิวเตอร์ แอนด์ คอนซัลแทนส์</div>
        </div>
      </div>
      <div class="form-title">${escapeHtml(titleFor(document.kind))}</div>
    </header>
    <section class="meta-grid">
      <div class="meta-box">
        <span class="meta-label">Customer Name :</span>
        <span class="meta-value">${escapeHtml(customerName(document.transaction))}</span>
      </div>
      <div class="meta-box">
        <span class="meta-label">Requisition No. :</span>
        <span class="meta-value">${escapeHtml(displayReference)}${escapeHtml(pageSuffix)}</span>
      </div>
      <div class="meta-box">
        <span class="meta-label">Detail :</span>
        <span class="meta-value">${escapeHtml(document.transaction.note)}</span>
      </div>
      <div class="meta-box flags">${requestFlags(document.transaction)}</div>
    </section>
  `;
}

function tableHeader(kind: DocumentKind) {
  if (kind === "SALE") {
    return ["No.", "Model", "Stock Code No.", "Serial No.", "QTY", "Price", "Total", "Details"];
  }

  return ["No.", "Model", "Stock Code No.", "Serial No.", "QTY", "Description"];
}

function rowCells(
  document: ExportDocument,
  item: PrintableTransactionItem,
  rowNumber: number,
) {
  const quantity = item.requestedQuantity ?? 1;
  const salePrice = item.soldPrice ?? document.transaction.soldPrice;
  const price = formatMoney(salePrice);
  const rowTotal = item.soldTotal != null ? formatMoney(item.soldTotal) : "";

  if (document.kind === "SALE") {
    return [
      rowNumber,
      modelName(item),
      stockCode(item),
      serialNo(item),
      quantity,
      price,
      rowTotal,
      descriptionText(item),
    ];
  }

  return [
    rowNumber,
    modelName(item),
    stockCode(item),
    serialNo(item),
    quantity,
    descriptionText(item),
  ];
}

function table(
  document: ExportDocument,
  items: PrintableTransactionItem[],
  rowOffset: number,
) {
  const headers = tableHeader(document.kind);
  const rows = items
    .map((item, index) => {
      const cells = rowCells(document, item, rowOffset + index + 1);

      return `
        <tr>
          ${cells
            .map((value, cellIndex) => {
              const alignRight =
                document.kind === "SALE" &&
                ["Price", "Total"].includes(headers[cellIndex]);
              const alignCenter = ["No.", "QTY"].includes(headers[cellIndex]);

              return `<td class="${alignRight ? "right" : alignCenter ? "center" : ""}">${escapeHtml(value)}</td>`;
            })
            .join("")}
        </tr>
      `;
    })
    .join("");
  const total =
    document.kind === "SALE"
      ? numberValue(document.transaction.soldPrice)
      : 0;

  return `
    <section class="items-section">
      <div class="section-title">${escapeHtml(sectionTitleFor(document.kind))}</div>
      <table class="items-table ${document.kind.toLowerCase()}">
        <thead>
          <tr>${headers.map((headerText) => `<th>${escapeHtml(headerText)}</th>`).join("")}</tr>
        </thead>
        <tbody>${rows}</tbody>
        ${
          document.kind === "SALE"
            ? `<tfoot><tr><td colspan="${headers.length - 2}" class="total-label">Total</td><td class="right">${escapeHtml(formatMoney(total))}</td><td></td></tr></tfoot>`
            : ""
        }
      </table>
    </section>
  `;
}

function page(
  document: ExportDocument,
  items: PrintableTransactionItem[],
  pageIndex: number,
  pageTotal: number,
  rowOffset: number,
) {
  return `
    <main class="page ${document.kind.toLowerCase()}">
      ${header(document, pageIndex, pageTotal)}
      ${table(document, items, rowOffset)}
      ${directedBy(document.transaction)}
      ${signatures(document)}
      <div class="footer-code">FM-5300(2)-R.5</div>
    </main>
  `;
}

function approvalsForDocument(
  transaction: PrintableTransaction,
  kind: DocumentKind,
  items: PrintableTransactionItem[],
) {
  const approvals = transaction.approvals ?? [];

  if (kind === "BORROW") {
    return approvals.filter((approval) => !approval.resolutionBatchId);
  }

  if (kind === "RETURN") {
    const batchIds = new Set(
      items.flatMap((item) =>
        (item.outcomes ?? [])
          .map((outcome) => outcome.resolutionBatchId)
          .filter((batchId): batchId is string => Boolean(batchId)),
      ),
    );

    if (batchIds.size > 0) {
      return approvals.filter((approval) =>
        approval.resolutionBatchId ? batchIds.has(approval.resolutionBatchId) : false,
      );
    }

    return approvals.filter((approval) => Boolean(approval.resolutionBatchId));
  }

  return approvals;
}

function documentsFor(transaction: PrintableTransaction): ExportDocument[] {
  const items = (transaction.items ?? []).flatMap((item) => {
    const groups = transaction.type === "SOLD" ? readStoredSalePriceGroups(item.salePriceGroups) : undefined;
    return groups?.length
      ? groups.map((group) => ({ ...item, requestedQuantity: group.quantity, soldPrice: group.unitPrice, soldTotal: group.total }))
      : [item];
  });
  const referenceNo = transactionNo(transaction);
  const documents: ExportDocument[] = [];

  if (transaction.type === "SOLD") {
    documents.push({
      approvals: approvalsForDocument(transaction, "SALE", items),
      kind: "SALE",
      items,
      referenceNo,
      showFromReference: Boolean(transaction.sourceTransaction),
      transaction,
    });
    return documents;
  }

  if (transaction.status === "RETURNED" && transaction.sourceTransactionId) {
    documents.push({
      approvals: approvalsForDocument(transaction, "RETURN", items),
      kind: "RETURN",
      items,
      referenceNo,
      showFromReference: Boolean(transaction.sourceTransaction),
      transaction,
    });
    return documents;
  }

  documents.push({
    approvals: approvalsForDocument(transaction, "BORROW", items),
    kind: "BORROW",
    items,
    referenceNo,
    showFromReference: false,
    transaction,
  });

  const returnedItems = items.filter(
    (item) => item.returnedAt && item.resolvedStatus !== "SOLD",
  );
  const soldItems = items.filter(
    (item) => item.returnedAt && item.resolvedStatus === "SOLD",
  );

  if (returnedItems.length > 0) {
    documents.push({
      approvals: approvalsForDocument(transaction, "RETURN", returnedItems),
      kind: "RETURN",
      items: returnedItems,
      referenceNo,
      showFromReference: true,
      transaction,
    });
  }

  if (soldItems.length > 0) {
    documents.push({
      approvals: approvalsForDocument(transaction, "SALE", soldItems),
      kind: "SALE",
      items: soldItems,
      referenceNo,
      showFromReference: true,
      transaction,
    });
  }

  return documents;
}

function documentStyles(fontUrls: TransactionDocumentFontUrls = {}) {
  const fontFaces = [
    fontUrls.regular
      ? `@font-face { font-family: "ThaiPdf"; src: url("${fontUrls.regular}") format("truetype"); font-weight: 400; font-style: normal; font-display: block; }`
      : "",
    fontUrls.bold
      ? `@font-face { font-family: "ThaiPdf"; src: url("${fontUrls.bold}") format("truetype"); font-weight: 700; font-style: normal; font-display: block; }`
      : "",
  ].join("\n");

  return `
    <style>
      ${fontFaces}
      @page { margin: 0; size: A4 portrait; }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #fff; }
      body {
        color: #000;
        font-family: "ThaiPdf", "Leelawadee UI", "Browallia New", BrowalliaUPC, Arial, sans-serif;
        font-size: 9pt;
        line-height: 1.12;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        background: #fff;
        height: 842pt;
        overflow: hidden;
        padding: 31pt 38pt 24pt;
        page-break-after: always;
        position: relative;
        width: 595pt;
      }
      .page:last-child { page-break-after: auto; }
      .header {
        align-items: center;
        display: grid;
        gap: 12pt;
        grid-template-columns: minmax(0, 1fr) 190pt;
        height: 64pt;
      }
      .brand {
        align-items: center;
        display: flex;
        gap: 14pt;
      }
      .logo {
        align-items: center;
        border: 1pt solid #c8c8c8;
        border-radius: 50%;
        color: #111;
        display: flex;
        flex: 0 0 auto;
        font: 700 12pt Calibri, Arial, sans-serif;
        height: 46pt;
        justify-content: center;
        transform: rotate(-8deg);
        width: 52pt;
      }
      .company-en,
      .company-th {
        font-family: "ThaiPdf", "Leelawadee UI", "Angsana New", AngsanaUPC, "Times New Roman", serif;
        font-weight: 700;
        letter-spacing: 0;
        white-space: nowrap;
      }
      .company-en { font-size: 14pt; }
      .company-th { font-size: 13pt; margin-top: 2pt; }
      .form-title {
        align-items: center;
        background: #29558d;
        border-radius: 7pt;
        color: #fff;
        display: flex;
        font: 700 16pt Calibri, Arial, sans-serif;
        height: 38pt;
        justify-content: center;
        overflow: hidden;
        padding: 0 8pt;
        text-align: center;
        white-space: nowrap;
      }
      .meta-grid {
        display: grid;
        gap: 8pt 6pt;
        grid-template-columns: 1fr 198pt;
        margin-top: 10pt;
      }
      .meta-box {
        align-items: center;
        background: #dce8f5;
        border-radius: 4pt;
        display: flex;
        gap: 5pt;
        height: 24pt;
        overflow: hidden;
        padding: 2pt 8pt;
      }
      .flags {
        justify-content: space-around;
        padding: 2pt 7pt;
      }
      .meta-label,
      .flag,
      th {
        font-family: Calibri, Arial, sans-serif;
        font-weight: 700;
      }
      .meta-label {
        flex: 0 0 auto;
        font-size: 8pt;
      }
      .meta-value {
        font-size: 9pt;
        font-weight: 700;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .flag {
        align-items: center;
        display: inline-flex;
        font-size: 8pt;
        gap: 5pt;
      }
      .checkbox {
        align-items: center;
        border: 1pt solid #111;
        display: inline-flex;
        font-size: 8pt;
        height: 11pt;
        justify-content: center;
        line-height: 1;
        width: 11pt;
      }
      .items-section { margin-top: 13pt; }
      .section-title {
        font-size: 10pt;
        font-weight: 700;
        margin: 0 0 8pt 2pt;
      }
      .items-table {
        border-collapse: collapse;
        font-family: "ThaiPdf", "Leelawadee UI", "Browallia New", BrowalliaUPC, Arial, sans-serif;
        font-size: 8.4pt;
        line-height: 1;
        table-layout: fixed;
        width: 100%;
      }
      .items-table th,
      .items-table td {
        border: 0.75pt solid #555;
        height: 19pt;
        overflow: hidden;
        padding: 2pt 4pt;
        text-overflow: ellipsis;
        vertical-align: middle;
        white-space: nowrap;
      }
      .items-table th {
        background: #d9d9d9;
        border-color: #222;
        font-size: 8pt;
        text-align: center;
      }
      .center { text-align: center; }
      .right { text-align: right; }
      .items-table tfoot td {
        background: #d9d9d9;
        font-family: Calibri, Arial, sans-serif;
        font-weight: 700;
      }
      .total-label { text-align: center; }
      .items-table.borrow th:nth-child(1),
      .items-table.return th:nth-child(1),
      .items-table.borrow td:nth-child(1),
      .items-table.return td:nth-child(1) { width: 28pt; }
      .items-table.borrow th:nth-child(2),
      .items-table.return th:nth-child(2),
      .items-table.borrow td:nth-child(2),
      .items-table.return td:nth-child(2) { width: 82pt; }
      .items-table.borrow th:nth-child(3),
      .items-table.return th:nth-child(3),
      .items-table.borrow td:nth-child(3),
      .items-table.return td:nth-child(3) { width: 105pt; }
      .items-table.borrow th:nth-child(4),
      .items-table.return th:nth-child(4),
      .items-table.borrow td:nth-child(4),
      .items-table.return td:nth-child(4) { width: 96pt; }
      .items-table.borrow th:nth-child(5),
      .items-table.return th:nth-child(5),
      .items-table.borrow td:nth-child(5),
      .items-table.return td:nth-child(5) { width: 34pt; }
      .items-table.sale th:nth-child(1),
      .items-table.sale td:nth-child(1) { width: 24pt; }
      .items-table.sale th:nth-child(2),
      .items-table.sale td:nth-child(2) { width: 72pt; }
      .items-table.sale th:nth-child(3),
      .items-table.sale td:nth-child(3) { width: 86pt; }
      .items-table.sale th:nth-child(4),
      .items-table.sale td:nth-child(4) { width: 84pt; }
      .items-table.sale th:nth-child(5),
      .items-table.sale td:nth-child(5) { width: 30pt; }
      .items-table.sale th:nth-child(6),
      .items-table.sale td:nth-child(6),
      .items-table.sale th:nth-child(7),
      .items-table.sale td:nth-child(7) { width: 52pt; }
      .signatures {
        bottom: 46pt;
        display: grid;
        gap: 18pt 12pt;
        grid-template-columns: 1fr 1fr;
        left: 38pt;
        position: absolute;
        right: 38pt;
      }
      .signatures-three {
        grid-template-columns: 22fr 28fr 50fr;
      }
      .signatures-four {
        grid-template-columns: 22fr 28fr 50fr;
      }
      .signatures-four .signature:nth-child(4) {
        grid-column: 3;
      }
      .directed-by {
        font-size: 8pt;
        left: 38pt;
        margin-top: 4pt;
        right: 38pt;
      }
      .signature {
        min-width: 0;
        min-height: 66pt;
        position: relative;
      }
      .signature-items {
        align-items: flex-start;
        display: flex;
        flex-wrap: wrap;
        gap: 12pt;
      }
      .signature-label {
        font-size: 8.2pt;
        font-weight: 700;
        margin-bottom: 4pt;
      }
      .signature-item {
        flex: 1 1 82pt;
        min-width: 82pt;
        max-width: 100%;
      }
      .signature-line {
        border-bottom: 1pt solid #777;
        height: 34pt;
        min-width: 0;
        position: relative;
        width: 100%;
      }
      .signature-images {
        align-items: flex-end;
        bottom: 2pt;
        display: flex;
        justify-content: center;
        left: 0;
        position: absolute;
        right: 0;
      }
      .signature-image {
        height: 30pt;
        max-width: 100%;
        object-fit: contain;
        width: 96pt;
      }
      .signature-user {
        font-size: 8pt;
        line-height: 1.15;
        margin-top: 4pt;
        min-height: 10pt;
        overflow-wrap: anywhere;
        text-align: center;
      }
      .signature-date {
        font-size: 8pt;
        margin-top: 4pt;
        padding-left: 0;
        text-align: center;
        white-space: nowrap;
      }
      .footer-code {
        bottom: 11pt;
        font-size: 7.5pt;
        position: absolute;
        right: 38pt;
        text-align: right;
      }
    </style>
  `;
}

export function buildUnifiedRequisitionHtml(documents: PrintableTransaction[], fontUrls: TransactionDocumentFontUrls = {}) {
  const transaction = documents[0];
  const issue: ExportDocument = { transaction, kind: "BORROW", items: transaction.items ?? [], approvals: [], referenceNo: transactionNo(transaction), showFromReference: false };
  const returns = documents.slice(1).flatMap((document) => document.items ?? []);
  const approvals = documents.flatMap((document) => [
    ...(document.approvals ?? []),
    { requiredTag: "REQUESTER", status: "APPROVED", actedAt: document.requestDate ?? document.createdAt, user: document.requestedBy, approverSignatureSnapshot: document.requestedBy?.signatureDataUrl },
  ]).filter((approval) => approval.status === "APPROVED" && !approval.requiredTag?.startsWith("ACK_"));
  const unique = (matcher: (tag: string) => boolean) => {
    const people = new Map<string, (typeof approvals)[number]>();
    for (const approval of approvals.filter((entry) => matcher(entry.requiredTag ?? ""))) {
      const key = approval.user?.email || approval.user?.name || "";
      if (!key) continue;
      const previous = people.get(key);
      if (!previous || new Date(approval.actedAt ?? 0).getTime() >= new Date(previous.actedAt ?? 0).getTime()) people.set(key, approval);
    }
    return [...people.values()];
  };
  const returnHeaders = ["No.", "Model", "Stock Code", "Serial No.", "QTY", "Status", "Remark"];
  const returnRows = returns.map((item, index) => `<tr>${[index + 1, modelName(item), stockCode(item), serialNo(item), item.requestedQuantity ?? 1, item.resolvedStatus ?? "", item.resolutionNote ?? item.note ?? ""].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  const body = `<main class="page unified">
    ${header(issue, 0, 1).replace(escapeHtml(titleFor("BORROW")), "ใบยืม - คืน อุปกรณ์")}
    ${table(issue, issue.items, 0).replace('class="items-table borrow"', 'class="items-table borrow req-table"')}
    <section class="items-section"><div class="section-title">รายการอุปกรณ์ (คืน) :</div><table class="items-table unified-return ret-table"><thead><tr>${returnHeaders.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${returnRows}</tbody></table></section>
    <footer class="unified-footer"><div class="directed-by">Directed by: BSD, Warehouse Manager</div><section class="signatures signatures-three">
      ${signature("Requisition by :", { approvalItems: unique((tag) => tag === "REQUESTER") })}
      ${signature("Lead Project / Supervisor :", { approvalItems: unique((tag) => tag !== "REQUESTER" && leadApprovalMatcher(tag)) })}
      ${signature("Storeman :", { approvalItems: unique((tag) => tag.startsWith("STOREMAN:")) })}
    </section><div class="footer-code">FM-5300(2)-R.5</div></footer>
  </main>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>${documentStyles(fontUrls)}<style>
    @page unified { margin: 24pt 38pt; }
    .page.unified { page: unified; width: auto; height: auto; min-height: 794pt; overflow: visible; padding: 7pt 0 0; display: flex; flex-direction: column; }
    .unified .items-section { break-inside: auto; }
    .unified thead { display: table-header-group; }
    .unified tr { break-inside: avoid; }
    .unified .items-table td { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
    .unified-footer { margin-top: auto; padding-top: 12pt; break-inside: avoid; }
    .unified .signatures { position: static; margin-top: 10pt; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12pt; }
    .unified .signature-items { flex-wrap: nowrap; gap: 5pt; }
    .unified .signature-item { flex: 1 1 0; min-width: 0; }
    .unified .signature-user, .unified .signature-date { white-space: normal; font-size: 7pt; }
    .unified .footer-code { position: static; margin-top: 8pt; }
    .unified .req-table, .unified .ret-table { table-layout: fixed; width: 100%; }
    .unified .req-table th, .unified .req-table td, .unified .ret-table th, .unified .ret-table td { padding: 6px 8px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; }
    .unified .req-table th:nth-child(1), .unified .req-table td:nth-child(1) { width: 6%; text-align: center; }
    .unified .req-table th:nth-child(2), .unified .req-table td:nth-child(2) { width: 22%; text-align: left; }
    .unified .req-table th:nth-child(3), .unified .req-table td:nth-child(3) { width: 20%; text-align: left; }
    .unified .req-table th:nth-child(4), .unified .req-table td:nth-child(4) { width: 18%; text-align: center; }
    .unified .req-table th:nth-child(5), .unified .req-table td:nth-child(5) { width: 6%; text-align: center; }
    .unified .req-table th:nth-child(6), .unified .req-table td:nth-child(6) { width: 28%; text-align: left; }
    .unified .ret-table th:nth-child(1), .unified .ret-table td:nth-child(1) { width: 5%; text-align: center; }
    .unified .ret-table th:nth-child(2), .unified .ret-table td:nth-child(2) { width: 20%; text-align: left; }
    .unified .ret-table th:nth-child(3), .unified .ret-table td:nth-child(3) { width: 18%; text-align: left; }
    .unified .ret-table th:nth-child(4), .unified .ret-table td:nth-child(4) { width: 15%; text-align: center; }
    .unified .ret-table th:nth-child(5), .unified .ret-table td:nth-child(5) { width: 5%; text-align: center; }
    .unified .ret-table th:nth-child(6), .unified .ret-table td:nth-child(6) { width: 12%; text-align: center; }
    .unified .ret-table th:nth-child(7), .unified .ret-table td:nth-child(7) { width: 25%; text-align: left; }
  </style></head><body>${body}</body></html>`;
}

export function buildTransactionDocumentHtml(
  transaction: PrintableTransaction,
  fontUrls: TransactionDocumentFontUrls = {},
) {
  const documents = documentsFor(transaction);
  const pages = documents
    .flatMap((document) => {
      const chunks = chunkItems(document.items, ROWS_PER_PAGE[document.kind]);

      return chunks.map((items, pageIndex) =>
        page(
          document,
          items,
          pageIndex,
          chunks.length,
          pageIndex * ROWS_PER_PAGE[document.kind],
        ),
      );
    })
    .join("");

  return `<!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(transactionNo(transaction))}</title>
        ${documentStyles(fontUrls)}
      </head>
      <body>${pages}</body>
    </html>`;
}
