import { describe, expect, it } from "vitest";
import { buildTransactionDocumentHtml } from "./transaction-document";

describe("transaction document", () => {
  it("rejects malformed stored price-group JSON before rendering sale amounts", () => {
    expect(() => buildTransactionDocumentHtml({
      type: "SOLD", transactionNo: "REQ-INVALID-PRICE",
      items: [{ requestedQuantity: 1, salePriceGroups: [{ quantity: "1", unitPrice: "10.00", total: "10.00" }] }],
    })).toThrow("Stored sale price groups are invalid");
  });

  it("preserves valid historical price-group totals", () => {
    const html = buildTransactionDocumentHtml({
      type: "SOLD", transactionNo: "REQ-VALID-PRICE",
      items: [{ requestedQuantity: 2, salePriceGroups: [{ quantity: 2, unitPrice: "10.00", total: "25.00" }] }],
    });
    expect(html).toContain("25.00");
  });
  it("uses BSD sale approval rather than acknowledgements as authorization", () => {
    const html = buildTransactionDocumentHtml({
      type: "SOLD",
      transactionNo: "REQ-SALE",
      approvals: [
        { requiredTag: "BSD_HELP_DESK", status: "APPROVED", user: { name: "Sale approver" }, approverSignatureSnapshot: "data:image/png;base64,SALE_SIGNATURE" },
        { requiredTag: "ACK_BSD", status: "APPROVED", user: { name: "BSD acknowledgement" }, approverSignatureSnapshot: "data:image/png;base64,ACK_SIGNATURE" },
        { requiredTag: "ACK_WAREHOUSE_MANAGER", status: "APPROVED", user: { name: "Manager acknowledgement" } },
        { requiredTag: "STOREMAN:INSTALLATION", status: "APPROVED", user: { name: "Installation store" } },
        { requiredTag: "STOREMAN:SERVER", status: "APPROVED", user: { name: "Server store" } },
      ],
    });
    expect(html).toContain("Sale approver");
    expect(html).toContain("SALE_SIGNATURE");
    expect(html).not.toContain("BSD acknowledgement");
    expect(html).not.toContain("Manager acknowledgement");
    expect(html).not.toContain("ACK_SIGNATURE");
    expect(html).toContain("Installation store");
    expect(html).toContain("Server store");
  });
  it("uses manually entered totals without recalculating prices", () => {
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
          soldTotal: "1600",
        },
        {
          asset: {
            assetModel: { name: "Switch B" },
            serialNo: "SN-B",
            stockCode: "NW-SW0002",
          },
          requestedQuantity: 2,
          soldPrice: "2750",
          soldTotal: "5600",
        },
      ],
      projectRequest: true,
      purpose: "Project Alpha",
      requestedBy: { name: "Requester" },
      serviceRequest: false,
      transactionNo: "REQ-20260720-01",
      type: "SOLD",
      soldPrice: "7300",
    });

    expect(html).toContain("1,500.00");
    expect(html).toContain("2,750.00");
    expect(html).toContain("1,600.00");
    expect(html).toContain("5,600.00");
    expect(html).toContain("7,300.00");
    expect(html).not.toContain("5,500.00");
  });

  it("includes the configured Thai font and preserves Thai text", () => {
    const html = buildTransactionDocumentHtml(
      {
        note: "เหตุผลภาษาไทย",
        requestedBy: { name: "ผู้ขอทดสอบ" },
        transactionNo: "REQ-THAI-01",
      },
      {
        bold: "file:///C:/Windows/Fonts/leelawdb.ttf",
        regular: "file:///C:/Windows/Fonts/LeelawUI.ttf",
      },
    );

    expect(html).toContain('font-family: "ThaiPdf"');
    expect(html).toContain("เหตุผลภาษาไทย");
  });

  it("keeps quantity columns for hybrid items and uses four requisition signatures", () => {
    const html = buildTransactionDocumentHtml({
      internalRequest: true,
      items: [
        {
          asset: {
            assetModel: { isSerialized: true, name: "Serialized item" },
            serialNo: "SN-001",
            stockCode: "ST-001",
          },
          requestedQuantity: 1,
        },
        {
          asset: {
            assetModel: { isSerialized: false, name: "Quantity item" },
            serialNo: null,
            stockCode: "QT-001",
          },
          requestedQuantity: 3,
        },
      ],
      requestedBy: { name: "Requester" },
      transactionNo: "REQ-HYBRID-01",
      type: "BORROW",
    });

    expect(html).toContain(">QTY</th>");
    expect(html).toContain("Storeman :");
    expect(html).not.toContain("BSD / Manager :");
    expect(html).not.toContain("Authorized by :");
  });

  it("uses the sale columns and adds the authorized signature block", () => {
    const html = buildTransactionDocumentHtml({
      items: [{ requestedQuantity: 2, soldPrice: "125" }],
      transactionNo: "SALE-01",
      type: "SOLD",
    });

    expect(html).toContain(">Price</th>");
    expect(html).toContain(">Total</th>");
    expect(html).toContain(">Details</th>");
    expect(html).toContain("Authorized by :");
  });

  it("uses the product description in the item table instead of the request note", () => {
    const html = buildTransactionDocumentHtml({
      items: [{
        asset: {
          assetModel: { description: "Product description", name: "Model A" },
          stockCode: "ST-001",
        },
        note: "Request note should stay out of the table",
      }],
      note: "Request note should stay out of the table",
      transactionNo: "REQ-DESCRIPTION-01",
      type: "BORROW",
    });

    expect(html).toContain("Product description");
    expect(html).toContain("Request note should stay out of the table");
    expect(html.match(/Request note should stay out of the table/g)).toHaveLength(1);
  });

  it("shows only signatures for the approval batch represented by the return items", () => {
    const html = buildTransactionDocumentHtml({
      approvals: [
        {
          requiredTag: "LEAD_PROJECT",
          status: "APPROVED",
          user: { name: "Tanawat W." },
        },
        {
          requiredTag: "STOREMAN:BSD",
          resolutionBatchId: "return-batch-1",
          status: "APPROVED",
          user: { name: "BSD Storeman" },
        },
        {
          requiredTag: "STOREMAN:INSTALLATION",
          resolutionBatchId: "return-batch-2",
          status: "APPROVED",
          user: { name: "Other Storeman" },
        },
      ],
      items: [{
        id: "returned-item",
        outcomes: [{ resolutionBatchId: "return-batch-1" }],
        returnedAt: new Date("2026-09-30T00:00:00.000Z"),
      }],
      requestedBy: { name: "Requester" },
      sourceTransactionId: "source-transaction",
      status: "IN_PROGRESS",
      transactionNo: "REQ-RETURN-01",
      type: "USING",
    });

    expect(html.match(/\( Tanawat W\. \)/g)).toHaveLength(1);
    expect(html.match(/\( BSD Storeman \)/g)).toHaveLength(1);
    expect(html).not.toContain("Other Storeman");
  });
});
