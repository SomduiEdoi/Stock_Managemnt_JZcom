export type PrintableAsset = {
  assetModel?: {
    assetType?: { trackMethod?: "QUANTITY" | "SERIAL" | string | null } | null;
    brand?: string | null;
    category?: { name?: string | null } | null;
    name?: string | null;
    typeName?: string | null;
  } | null;
  domain?: {
    code?: string | null;
    inventoryFamily?: "QUANTITY" | "SERIAL" | string | null;
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
  requestedQuantity?: number | null;
  resolutionNote?: string | null;
  resolvedStatus?: string | null;
  soldPrice?: { toString(): string } | number | string | null;
  returnedAt?: Date | string | null;
  note?: string | null;
};

export type PrintableTransaction = {
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
  completedAt?: Date | string | null;
  createdAt?: Date | string;
  documentRef?: string | null;
  dueDate?: Date | string | null;
  id?: string;
  internalRequest?: boolean;
  items?: PrintableTransactionItem[];
  note?: string | null;
  project?: { id?: string | null; name?: string | null; projectId?: string | null } | null;
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
  kind: DocumentKind;
  items: PrintableTransactionItem[];
  referenceNo: string;
  showFromReference: boolean;
  transaction: PrintableTransaction;
};

const ROWS_PER_PAGE = {
  BORROW: 22,
  RETURN: 12,
  SALE: 8,
} as const satisfies Record<DocumentKind, number>;

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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

function isQuantityItem(item: PrintableTransactionItem) {
  const asset = item.asset;

  return (
    (item.requestedQuantity ?? 1) > 1 ||
    asset?.assetModel?.assetType?.trackMethod === "QUANTITY" ||
    asset?.domain?.inventoryFamily === "QUANTITY" ||
    !asset?.serialNo
  );
}

function documentUsesQuantity(items: PrintableTransactionItem[]) {
  return items.some(isQuantityItem);
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

function detailsText(item: PrintableTransactionItem) {
  return (
    item.note ??
    item.asset?.assetModel?.typeName ??
    item.asset?.assetModel?.category?.name ??
    ""
  );
}

function remarkText(item: PrintableTransactionItem) {
  return item.resolutionNote ?? item.note ?? "";
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
) {
  return (
    transaction.approvals?.filter(
      (approval) =>
        approval.status === "APPROVED" && matcher(approval.requiredTag ?? ""),
    ) ?? []
  );
}

function leadApprovalMatcher(requiredTag: string) {
  return (
    requiredTag === "LEAD_PROJECT" ||
    (!requiredTag.startsWith("STOCK_CONTROLLER:") &&
      !requiredTag.startsWith("HEAD_STOCK_CONTROLLER:") &&
      !requiredTag.startsWith("BSD_"))
  );
}

function latestApprovalDate(
  approvals: NonNullable<PrintableTransaction["approvals"]>,
) {
  return approvals.at(-1)?.actedAt ?? null;
}

function approvalNames(
  approvals: NonNullable<PrintableTransaction["approvals"]>,
) {
  return approvals
    .map((approval) => approval.user?.name)
    .filter(Boolean)
    .join(" / ");
}

function approvalSignatureImages(
  approvals: NonNullable<PrintableTransaction["approvals"]>,
) {
  return approvals
    .map((approval) => approval.user?.signatureDataUrl)
    .filter(Boolean)
    .map(
      (signatureDataUrl) =>
        '<img alt="Signature" class="signature-image inline-signature-image" src="' +
        escapeHtml(signatureDataUrl) +
        '" />',
    )
    .join("");
}

function signature(
  title: string,
  options: {
    date?: Date | string | null;
    signatureDataUrl?: string | null;
    signatureHtml?: string;
    userName?: string | null;
  } = {},
) {
  const signatureImage = options.signatureHtml ?? (options.signatureDataUrl
    ? '<img alt="Signature" class="signature-image" src="' + escapeHtml(options.signatureDataUrl) + '" />'
    : "");
  const userName = options.userName ?? "";

  return `
    <div class="signature">
      <div class="signature-row">
        <span class="signature-label">${escapeHtml(title)}</span>
        <span class="signature-line"></span>
      </div>
      ${signatureImage}
      <div class="signature-user">( ${escapeHtml(userName)} )</div>
      <div class="signature-date">Date : ${escapeHtml(formatDateTime(options.date))}</div>
    </div>
  `;
}

function signatures(transaction: PrintableTransaction) {
  const requester = {
    date: transaction.requestDate ?? transaction.createdAt ?? null,
    signatureDataUrl: transaction.requestedBy?.signatureDataUrl ?? null,
  };
  const lead = approvalsFor(transaction, leadApprovalMatcher);
  const stock = approvalsFor(transaction, (tag) =>
    tag.startsWith("STOCK_CONTROLLER:"),
  );
  const headStock = approvalsFor(transaction, (tag) =>
    tag.startsWith("HEAD_STOCK_CONTROLLER:"),
  );
  const bsd = approvalsFor(transaction, (tag) => tag.startsWith("BSD_"));

  return `
    <section class="signatures signatures-five">
      ${signature("Requisition by :", {
        ...requester,
        userName: transaction.requestedBy?.name,
      })}
      ${signature("Lead Project / Supervisor :", {
        date: latestApprovalDate(lead),
        signatureHtml: approvalSignatureImages(lead),
        userName: approvalNames(lead),
      })}
      ${signature("Stock Controller :", {
        date: latestApprovalDate(stock),
        signatureHtml: approvalSignatureImages(stock),
        userName: approvalNames(stock),
      })}
      ${signature("Head Stock Controller :", {
        date: latestApprovalDate(headStock),
        signatureHtml: approvalSignatureImages(headStock),
        userName: approvalNames(headStock),
      })}
      ${signature("BSD :", {
        date: latestApprovalDate(bsd),
        signatureHtml: approvalSignatureImages(bsd),
        userName: approvalNames(bsd),
      })}
    </section>
  `;
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
  if (transaction.projectRequest) {
    return transaction.project?.name ?? transaction.purpose ?? "-";
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
        <span class="meta-label">Description :</span>
        <span class="meta-value">${escapeHtml(document.transaction.note)}</span>
      </div>
      <div class="meta-box flags">${requestFlags(document.transaction)}</div>
    </section>
  `;
}

function tableHeader(kind: DocumentKind, hasQty: boolean) {
  if (kind === "SALE") {
    return hasQty
      ? ["No.", "Model", "Stock Code No.", "Serial No.", "QTY", "Price", "Total", "Details"]
      : ["No.", "Model", "Stock Code No.", "Serial No.", "Price", "Details"];
  }

  if (kind === "RETURN") {
    return hasQty
      ? ["No.", "Model", "Stock Code No.", "Serial No.", "QTY", "Details"]
      : ["No.", "Model", "Stock Code No.", "Serial No.", "Remark"];
  }

  return hasQty
    ? ["No.", "Model", "Stock Code No.", "Serial No.", "QTY", "Details"]
    : ["No.", "Model", "Stock Code No.", "Serial No.", "Details"];
}

function rowCells(
  document: ExportDocument,
  item: PrintableTransactionItem,
  rowNumber: number,
  hasQty: boolean,
) {
  const quantity = item.requestedQuantity ?? 1;
  const salePrice = item.soldPrice ?? document.transaction.soldPrice;
  const price = formatMoney(salePrice);
  const rowTotal = price
    ? formatMoney(numberValue(salePrice) * quantity)
    : "";

  if (document.kind === "SALE") {
    return hasQty
      ? [
          rowNumber,
          modelName(item),
          stockCode(item),
          serialNo(item),
          quantity,
          price,
          rowTotal,
          detailsText(item),
        ]
      : [
          rowNumber,
          modelName(item),
          stockCode(item),
          serialNo(item),
          price,
          detailsText(item),
        ];
  }

  if (document.kind === "RETURN") {
    return hasQty
      ? [
          rowNumber,
          modelName(item),
          stockCode(item),
          serialNo(item),
          quantity,
          remarkText(item),
        ]
      : [
          rowNumber,
          modelName(item),
          stockCode(item),
          serialNo(item),
          remarkText(item),
        ];
  }

  return hasQty
    ? [
        rowNumber,
        modelName(item),
        stockCode(item),
        serialNo(item),
        quantity,
        detailsText(item),
      ]
    : [
        rowNumber,
        modelName(item),
        stockCode(item),
        serialNo(item),
        detailsText(item),
      ];
}

function table(
  document: ExportDocument,
  items: PrintableTransactionItem[],
  rowOffset: number,
) {
  const hasQty = documentUsesQuantity(document.items);
  const headers = tableHeader(document.kind, hasQty);
  const rows = items
    .map((item, index) => {
      const cells = rowCells(document, item, rowOffset + index + 1, hasQty);

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
      ? items.reduce(
          (sum, item) =>
            sum +
            numberValue(item.soldPrice ?? document.transaction.soldPrice) *
              (item.requestedQuantity ?? 1),
          0,
        )
      : 0;

  return `
    <section class="items-section">
      <div class="section-title">${escapeHtml(sectionTitleFor(document.kind))}</div>
      <table class="items-table ${hasQty ? "with-qty" : "without-qty"} ${document.kind.toLowerCase()}">
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
      ${signatures(document.transaction)}
      <div class="footer-code">FM-5300(2)-R.5</div>
    </main>
  `;
}

function documentsFor(transaction: PrintableTransaction): ExportDocument[] {
  const items = transaction.items ?? [];
  const referenceNo = transactionNo(transaction);
  const documents: ExportDocument[] = [];

  if (transaction.type === "SOLD") {
    documents.push({
      kind: "SALE",
      items,
      referenceNo: transaction.sourceTransaction ? sourceReference(transaction) : referenceNo,
      showFromReference: Boolean(transaction.sourceTransaction),
      transaction,
    });
    return documents;
  }

  documents.push({
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
      kind: "RETURN",
      items: returnedItems,
      referenceNo,
      showFromReference: true,
      transaction,
    });
  }

  if (soldItems.length > 0) {
    documents.push({
      kind: "SALE",
      items: soldItems,
      referenceNo,
      showFromReference: true,
      transaction,
    });
  }

  return documents;
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
        gap: 24pt;
        grid-template-columns: 1fr 198pt;
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
        font-family: "Angsana New", AngsanaUPC, "Times New Roman", serif;
        font-weight: 700;
        letter-spacing: 0;
        white-space: nowrap;
      }
      .company-en { font-size: 17pt; }
      .company-th { font-size: 16pt; margin-top: 2pt; }
      .form-title {
        align-items: center;
        background: #29558d;
        border-radius: 7pt;
        color: #fff;
        display: flex;
        font: 700 19pt Calibri, Arial, sans-serif;
        height: 38pt;
        justify-content: center;
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
        font-family: "Browallia New", BrowalliaUPC, Arial, sans-serif;
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
      .items-table.without-qty.borrow th:nth-child(1),
      .items-table.without-qty.return th:nth-child(1),
      .items-table.without-qty.borrow td:nth-child(1),
      .items-table.without-qty.return td:nth-child(1) { width: 34pt; }
      .items-table.without-qty.borrow th:nth-child(2),
      .items-table.without-qty.return th:nth-child(2),
      .items-table.without-qty.borrow td:nth-child(2),
      .items-table.without-qty.return td:nth-child(2) { width: 90pt; }
      .items-table.without-qty.borrow th:nth-child(3),
      .items-table.without-qty.return th:nth-child(3),
      .items-table.without-qty.borrow td:nth-child(3),
      .items-table.without-qty.return td:nth-child(3) { width: 125pt; }
      .items-table.without-qty.borrow th:nth-child(4),
      .items-table.without-qty.return th:nth-child(4),
      .items-table.without-qty.borrow td:nth-child(4),
      .items-table.without-qty.return td:nth-child(4) { width: 105pt; }
      .items-table.with-qty th:nth-child(1),
      .items-table.with-qty td:nth-child(1) { width: 28pt; }
      .items-table.with-qty th:nth-child(2),
      .items-table.with-qty td:nth-child(2) { width: 82pt; }
      .items-table.with-qty th:nth-child(3),
      .items-table.with-qty td:nth-child(3) { width: 105pt; }
      .items-table.with-qty th:nth-child(4),
      .items-table.with-qty td:nth-child(4) { width: 96pt; }
      .items-table.with-qty th:nth-child(5),
      .items-table.with-qty td:nth-child(5) { width: 34pt; }
      .items-table.without-qty.sale th:nth-child(1),
      .items-table.without-qty.sale td:nth-child(1) { width: 28pt; }
      .items-table.without-qty.sale th:nth-child(2),
      .items-table.without-qty.sale td:nth-child(2) { width: 86pt; }
      .items-table.without-qty.sale th:nth-child(3),
      .items-table.without-qty.sale td:nth-child(3) { width: 96pt; }
      .items-table.without-qty.sale th:nth-child(4),
      .items-table.without-qty.sale td:nth-child(4) { width: 96pt; }
      .items-table.without-qty.sale th:nth-child(5),
      .items-table.without-qty.sale td:nth-child(5) { width: 70pt; }
      .items-table.with-qty.sale th:nth-child(6),
      .items-table.with-qty.sale td:nth-child(6),
      .items-table.with-qty.sale th:nth-child(7),
      .items-table.with-qty.sale td:nth-child(7) { width: 54pt; }
      .signatures {
        bottom: 46pt;
        display: grid;
        gap: 22pt 54pt;
        grid-template-columns: 1fr 1fr;
        left: 38pt;
        position: absolute;
        right: 38pt;
      }
      .signatures-five {
        grid-template-columns: 1fr 1fr 1fr;
      }
      .signature {
        min-height: 66pt;
        padding-top: 28pt;
        position: relative;
      }
      .signature-row {
        align-items: flex-end;
        display: flex;
        gap: 7pt;
      }
      .signature-label {
        flex: 0 0 auto;
        font-size: 8.2pt;
      }
      .signature-line {
        border-bottom: 1pt solid #777;
        flex: 1 1 auto;
        min-width: 76pt;
      }
      .signature-image {
        bottom: 39pt;
        height: 32pt;
        left: 68pt;
        object-fit: contain;
        position: absolute;
        width: 104pt;
      }
      .inline-signature-image {
        margin-right: 3pt;
        position: static;
        vertical-align: bottom;
      }
      .signature-user {
        font-size: 8pt;
        margin-top: 7pt;
        text-align: center;
      }
      .signature-date {
        font-size: 8pt;
        margin-top: 6pt;
        padding-left: 70pt;
      }
      .footer-code {
        bottom: 11pt;
        font-size: 7.5pt;
        left: 0;
        position: absolute;
        right: 0;
        text-align: center;
      }
    </style>
  `;
}

export function buildTransactionDocumentHtml(transaction: PrintableTransaction) {
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
        ${documentStyles()}
      </head>
      <body>${pages}</body>
    </html>`;
}
