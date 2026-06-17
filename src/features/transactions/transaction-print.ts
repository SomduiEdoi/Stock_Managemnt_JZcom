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
  createdAt?: Date | string;
  documentRef?: string | null;
  dueDate?: Date | string | null;
  id?: string;
  items?: Array<{ asset?: PrintableAsset | null }>;
  note?: string | null;
  purpose?: string | null;
  requestedBy?: { email?: string | null; name?: string | null } | null;
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

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function assetLocation(asset: PrintableAsset | null | undefined) {
  return asset?.location?.name ?? asset?.locationText ?? "-";
}

function buildRows(transaction: PrintableTransaction) {
  return (transaction.items ?? [])
    .map(({ asset }, index) => {
      const model = asset?.assetModel;

      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(model?.name)}</strong><br><span>${escapeHtml(model?.brand)}</span></td>
          <td>${escapeHtml(asset?.domain?.code)}</td>
          <td>${escapeHtml(asset?.serialNo)}</td>
          <td>${escapeHtml(assetLocation(asset))}</td>
        </tr>
      `;
    })
    .join("");
}

function buildDocument(transaction: PrintableTransaction) {
  const requester = transaction.requestedBy?.name ?? transaction.requestedBy?.email;

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(transaction.transactionNo ?? transaction.id)}</title>
      <style>
        body { color: #000; font-family: Arial, sans-serif; margin: 40px; }
        header { border-bottom: 3px solid #273F4F; display: flex; justify-content: space-between; padding-bottom: 16px; }
        h1 { color: #273F4F; font-size: 24px; margin: 0; }
        .badge { background: #FE7743; border-radius: 999px; color: white; display: inline-block; font-size: 12px; font-weight: 700; padding: 6px 12px; }
        .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 24px 0; }
        .field { background: #EFEEEA; border-radius: 6px; padding: 12px; }
        .label { color: #273F4F; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .value { font-size: 14px; margin-top: 6px; }
        table { border-collapse: collapse; margin-top: 18px; width: 100%; }
        th { background: #273F4F; color: white; font-size: 12px; text-align: left; }
        td, th { border: 1px solid #c8c8c8; padding: 10px; vertical-align: top; }
        td span { color: #555; font-size: 12px; }
        footer { color: #555; display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); margin-top: 42px; }
        .sign { border-top: 1px solid #273F4F; padding-top: 8px; text-align: center; }
      </style>
    </head>
    <body>
      <header>
        <div>
          <h1>Stock Management Request Slip</h1>
          <p>${escapeHtml(transaction.transactionNo ?? transaction.id)}</p>
        </div>
        <span class="badge">${escapeHtml(transaction.type)} / ${escapeHtml(transaction.status)}</span>
      </header>
      <section class="grid">
        <div class="field"><div class="label">Requester</div><div class="value">${escapeHtml(requester)}</div></div>
        <div class="field"><div class="label">Created Date</div><div class="value">${formatDate(transaction.createdAt)}</div></div>
        <div class="field"><div class="label">Expected Return Date</div><div class="value">${formatDate(transaction.dueDate)}</div></div>
        <div class="field"><div class="label">Reference</div><div class="value">${escapeHtml(transaction.documentRef)}</div></div>
      </section>
      <section class="field">
        <div class="label">Purpose</div>
        <div class="value">${escapeHtml(transaction.purpose)}</div>
        <div class="label" style="margin-top: 12px;">Use Detail</div>
        <div class="value">${escapeHtml(transaction.note)}</div>
      </section>
      <table>
        <thead><tr><th>#</th><th>Asset</th><th>Domain</th><th>Serial No.</th><th>Location</th></tr></thead>
        <tbody>${buildRows(transaction)}</tbody>
      </table>
      <footer>
        <div class="sign">Requester Signature</div>
        <div class="sign">Stock Owner Signature</div>
      </footer>
    </body>
  </html>`;
}

export function printTransaction(transaction: PrintableTransaction) {
  const popup = window.open("", "_blank", "height=720,width=960");

  if (!popup) {
    window.print();
    return;
  }

  popup.document.open();
  popup.document.write(buildDocument(transaction));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}
