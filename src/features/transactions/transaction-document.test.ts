import { describe, expect, it } from "vitest";
import { buildTransactionDocumentHtml } from "./transaction-document";

describe("transaction document", () => {
  it("uses structured item sold prices for sale rows and totals", () => {
    const html = buildTransactionDocumentHtml({
      createdAt: new Date("2026-07-20T00:00:00.000Z"),
      internalRequest: false,
      items: [
        {
          asset: {
            assetModel: { name: "Switch A" },
            serialNo: "SN-A",
            stockCode: "NW-SW0001",
          },
          requestedQuantity: 1,
          soldPrice: "1500",
        },
        {
          asset: {
            assetModel: { name: "Switch B" },
            serialNo: "SN-B",
            stockCode: "NW-SW0002",
          },
          requestedQuantity: 2,
          soldPrice: "2750",
        },
      ],
      projectRequest: true,
      purpose: "Project Alpha",
      requestedBy: { name: "Requester" },
      serviceRequest: false,
      transactionNo: "REQ-20260720-01",
      type: "SOLD",
    });

    expect(html).toContain("1,500.00");
    expect(html).toContain("2,750.00");
    expect(html).toContain("5,500.00");
    expect(html).toContain("7,000.00");
  });
});
