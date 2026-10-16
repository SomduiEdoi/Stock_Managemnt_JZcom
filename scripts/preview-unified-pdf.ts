import { writeFile } from "node:fs/promises";
import { buildUnifiedRequisitionHtml } from "../src/features/transactions/transaction-document";
import { renderDocumentPdf } from "../src/lib/transaction-pdf";

async function main() {
  for (const count of [3, 60]) {
    const issue = { transactionNo: "REQ-PREVIEW", type: "BORROW", requestedBy: { name: "Requester" }, requestDate: "2026-10-12", items: Array.from({ length: count }, (_, index) => ({ asset: { stockCode: `ST-${index}`, serialNo: null, assetModel: { name: "Fiber Cable", description: "Cable description" } }, requestedQuantity: 10 })), approvals: [{ requiredTag: "STOREMAN:INSTALLATION", status: "APPROVED", user: { name: "Store A" }, actedAt: "2026-10-10" }, { requiredTag: "STOREMAN:SERVER", status: "APPROVED", user: { name: "Store B" }, actedAt: "2026-10-11" }] };
    const returned = { ...issue, items: issue.items.slice(0, 3).map((item) => ({ ...item, requestedQuantity: 2, resolvedStatus: "READY", resolutionNote: "Returned in good condition" })) };
    const bytes = await renderDocumentPdf((fonts) => buildUnifiedRequisitionHtml([issue, returned], fonts));
    await writeFile(`C:/Users/ASUS/Documents/Codex/unified-preview-${count}.pdf`, bytes);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
