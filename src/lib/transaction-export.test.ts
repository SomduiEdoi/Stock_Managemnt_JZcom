import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AssetStatus,
  ApprovalStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
  TransactionWorkflowStatus,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  buildTransactionExportDocuments,
  buildTransactionExportDocumentHtml,
  getTransactionExportForUser,
  renderTransactionExportPdf,
  type TransactionExportRecord,
} from "./transaction-export";
import { db } from "./db";
import { hasRole } from "./permissions";
import { renderDocumentPdf } from "./transaction-pdf";

vi.mock("./db", () => ({
  db: {
    transaction: { findUnique: vi.fn() },
    transactionApproval: { count: vi.fn() },
  },
}));
vi.mock("./permissions", () => ({ hasRole: vi.fn() }));
vi.mock("./workflow", () => ({ WorkflowError: class extends Error {} }));
vi.mock("./transaction-pdf", () => ({ renderDocumentPdf: vi.fn() }));

const date = new Date("2026-10-05T03:00:00Z");
type Approval = TransactionExportRecord["approvals"][number];
function approval(
  name: string,
  requiredTag: string,
  resolutionBatchId: string | null = null,
  overrides: Partial<Approval> = {},
): Approval {
  return {
    actedAt: date,
    isCurrent: true,
    approverNameSnapshot: name,
    approverSignatureSnapshot: `data:image/png;base64,${name}`,
    requiredTag,
    resolutionBatchId,
    status: ApprovalStatus.APPROVED,
    stepSequence: requiredTag === "REQUESTER" ? 1 : 2,
    user: {
      name: `Live ${name}`,
      email: `${name}@example.com`,
      signatureDataUrl: `LIVE-SIGNATURE-${name}`,
    },
    ...overrides,
  };
}
type Outcome = TransactionExportRecord["outcomeSales"][number];
function outcome(
  id: string,
  resolutionBatchId: string | null,
  quantity: number,
  overrides: Partial<Outcome> = {},
): Outcome {
  return {
    id,
    assetId: "asset-1",
    transactionItemId: "item-1",
    quantity,
    outcomeStatus: AssetStatus.READY,
    approvedAt: date,
    resolutionBatchId,
    soldTransactionId: null,
    soldPrice: null,
    soldTotal: null,
    note: null,
    ...overrides,
  };
}
function transaction(
  overrides: Partial<TransactionExportRecord> = {},
): TransactionExportRecord {
  return {
    completedAt: date,
    createdAt: date,
    documentRef: null,
    dueDate: null,
    id: "source",
    internalRequest: false,
    note: null,
    project: null,
    projectId: null,
    projectRequest: false,
    purpose: "Test project",
    requestDate: date,
    requestedBy: {
      name: "Live requester",
      email: "requester@example.com",
      signatureDataUrl: "LIVE-REQUESTER-SIGNATURE",
    },
    returnedAt: null,
    serviceRequest: false,
    soldPrice: null,
    sourceTransactionId: null,
    sourceTransaction: null,
    status: TransactionStatus.USING,
    workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
    transactionNo: "REQ-SOURCE",
    type: TransactionType.USING,
    approvals: [
      approval("Issue requester", "REQUESTER"),
      approval("Issue lead", "LEAD_PROJECT"),
      approval("Issue store", "STOREMAN:BSD"),
    ],
    items: [
      {
        id: "item-1",
        assetId: "asset-1",
        assetModelId: "model-1",
        note: null,
        requestedQuantity: 10,
        resolutionNote: null,
        salePriceGroups: null,
        soldPrice: null,
        soldTotal: null,
        resolvedStatus: null,
        returnedAt: null,
        outcomes: [],
        assetModel: null,
        asset: {
          id: "asset-1",
          locationText: null,
          serialNo: "SN-1",
          stockCode: "ST-1",
          warehouse: { code: "BSD", name: "BSD" },
          location: null,
          assetModel: {
            isSerialized: false,
            brand: null,
            category: null,
            description: "Product description",
            name: "Model A",
            typeName: null,
          },
        },
      },
    ],
    outcomeSales: [],
    returnBatches: [],
    derivedTransactions: [],
    ...overrides,
  };
}

describe("transaction export document mapping", () => {
  beforeEach(() => vi.resetAllMocks());

  it("isolates issue, two posted batches and archived revisions", () => {
    const data = transaction();
    data.approvals.push(
      approval("Old issue", "LEAD_PROJECT", null, { isCurrent: false }),
      approval("Return requester A", "REQUESTER", "batch-a"),
      approval("Return lead A", "LEAD_PROJECT", "batch-a"),
      approval("Return check A", "RETURN_CHECK:BSD", "batch-a"),
      approval("Return store A", "STOREMAN:BSD", "batch-a"),
      approval("Old return A", "LEAD_PROJECT", "batch-a", { isCurrent: false }),
      approval("Return requester B", "REQUESTER", "batch-b"),
      approval("Return lead B", "LEAD_PROJECT", "batch-b"),
      approval("Pending store B", "STOREMAN:BSD", "batch-b", {
        status: ApprovalStatus.PENDING,
      }),
    );
    data.returnBatches = [
      {
        id: "batch-a",
        requestNo: "REQ-RETURN-A",
        createdAt: date,
        state: "COMPLETED",
      },
      {
        id: "batch-b",
        requestNo: "REQ-RETURN-B",
        createdAt: date,
        state: "COMPLETED",
      },
    ];
    data.items[0].outcomes = [
      outcome("a", "batch-a", 2),
      outcome("b", "batch-b", 3),
      outcome("pending", "batch-c", 5, { approvedAt: null }),
    ];
    const documents = buildTransactionExportDocuments(data);
    expect(documents).toHaveLength(3);
    expect(
      documents.map((document) => document.items?.[0].requestedQuantity),
    ).toEqual([10, 2, 3]);
    expect(documents[0].approvals?.map((a) => a.user?.name)).toEqual([
      "Issue lead",
      "Issue store",
    ]);
    expect(documents[1].approvals?.map((a) => a.user?.name)).toEqual([
      "Return lead A",
      "Return store A",
    ]);
    expect(documents[2].approvals?.map((a) => a.user?.name)).toEqual([
      "Return lead B",
    ]);
    expect(documents.map((document) => document.requestedBy?.name)).toEqual([
      "Issue requester",
      "Return requester A",
      "Return requester B",
    ]);
    expect(documents.map((document) => document.transactionNo)).toEqual([
      "REQ-SOURCE",
      "REQ-RETURN-A",
      "REQ-RETURN-B",
    ]);
    const html = buildTransactionExportDocumentHtml(data);
    expect(html.match(/<main /g)).toHaveLength(1);
    expect(html.match(/class="signatures signatures-three"/g)).toHaveLength(1);
    expect(html).toContain("ใบยืม - คืน อุปกรณ์");
    for (const excluded of [
      "Old issue",
      "Old return A",
      "Return check A",
      "Pending store B",
      "LIVE-REQUESTER-SIGNATURE",
      "LIVE-SIGNATURE",
    ])
      expect(html).not.toContain(excluded);
    expect(html.match(/\( Return requester B \)/g)).toHaveLength(1);
    expect(html).not.toContain("( Issue requester )");
  });

  it("uses REQUESTER snapshots and never falls back to a live signature", () => {
    const data = transaction();
    data.approvals[0].approverSignatureSnapshot = null;
    const [document] = buildTransactionExportDocuments(data);
    expect(document.requestedBy?.signatureDataUrl).toBeNull();
    expect(document.requestedBy?.name).toBe("Issue requester");
    expect(document.requestDate).toBe(date);
    expect(document.approvals?.some((a) => a.requiredTag === "REQUESTER")).toBe(
      false,
    );
    expect(buildTransactionExportDocumentHtml(data)).not.toContain("LIVE-");
  });

  it("preserves a null asset and genuine model metadata without inventing stock", () => {
    const data = transaction();
    data.items[0].asset = null;
    data.items[0].assetModel = {
      isSerialized: false,
      name: "Unallocated model",
      description: "Model description",
      typeName: null,
    };
    const [document] = buildTransactionExportDocuments(data);
    expect(document.items?.[0].asset).toBeNull();
    expect(document.items?.[0]).toMatchObject({
      assetModel: { isSerialized: false, name: "Unallocated model" },
      requestedQuantity: 10,
    });
    expect(() => buildTransactionExportDocumentHtml(data)).not.toThrow();
  });

  it("appends a posted derived sale with only its own current batch signatures and quantity", () => {
    const data = transaction();
    const postedSale = outcome("sale-outcome", "sale-batch", 4, {
      outcomeStatus: AssetStatus.SOLD,
      soldTransactionId: "sale",
      soldPrice: new Prisma.Decimal(100),
    });
    data.items[0].outcomes = [postedSale];
    const sale = transaction({
      id: "sale",
      type: TransactionType.SOLD,
      transactionNo: null,
      sourceTransactionId: "source",
      sourceTransaction: {
        id: "source",
        transactionNo: "REQ-SOURCE",
        documentRef: null,
      },
      status: TransactionStatus.COMPLETED,
      workflowStatus: TransactionWorkflowStatus.COMPLETED,
      approvals: [
        approval("Sale requester", "REQUESTER", "sale-batch"),
        approval("BSD sale", "BSD_STAFF", "sale-batch"),
        approval("BSD acknowledge only", "ACK_BSD", "sale-batch"),
        approval("Manager acknowledge only", "ACK_WAREHOUSE_MANAGER", "sale-batch"),
        approval("Old BSD sale", "BSD_STAFF", "sale-batch", {
          isCurrent: false,
        }),
        approval("Other sale", "BSD_STAFF", "other-batch"),
      ],
      outcomeSales: [postedSale],
    });
    sale.items[0].soldPrice = new Prisma.Decimal(125);
    sale.soldPrice = new Prisma.Decimal(500);
    data.derivedTransactions = [sale];
    const documents = buildTransactionExportDocuments(data);
    expect(documents).toHaveLength(2);
    expect(documents[1].items?.[0].requestedQuantity).toBe(4);
    expect(documents[1].approvals?.map((a) => a.user?.name)).toEqual([
      "BSD sale",
      "BSD acknowledge only",
      "Manager acknowledge only",
    ]);
    const html = buildTransactionExportDocumentHtml(data);
    const pages = html.match(/<main [\s\S]*?<\/main>/g)!;
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Issue lead");
    expect(pages[1]).not.toContain("Issue lead");
    expect(pages[1]).toContain("BSD sale");
    expect(pages[1]).not.toContain("BSD acknowledge only");
    expect(pages[1]).not.toContain("Manager acknowledge only");
    expect(pages[1]).toContain("from REQ-SOURCE");
    expect(pages[1]).not.toContain("From From");
    expect(pages[1]).toContain("500.00");
    expect(html).not.toContain("Old BSD sale");
    expect(html).not.toContain("Other sale");
    expect(html.match(/<!doctype html>/g)).toHaveLength(1);
  });

  it("omits pending derived sales and unposted outcomes", () => {
    const data = transaction();
    data.derivedTransactions = [
      transaction({
        id: "sale",
        type: TransactionType.SOLD,
        workflowStatus: TransactionWorkflowStatus.PENDING,
      }),
    ];
    data.items[0].outcomes = [
      outcome("pending", "batch", 10, { approvedAt: null }),
    ];
    expect(buildTransactionExportDocuments(data)).toHaveLength(1);
  });

  it("does not reuse issue approvals for an unbatched legacy return", () => {
    const data = transaction();
    data.items[0].returnedAt = date;
    data.items[0].resolvedStatus = AssetStatus.READY;
    const documents = buildTransactionExportDocuments(data);
    expect(documents).toHaveLength(2);
    expect(documents[1].approvals).toEqual([]);
    expect(documents[1].requestedBy?.signatureDataUrl).toBeNull();
  });

  it("fetches current approvals and the source bundle for a derived export", async () => {
    const source = transaction();
    const sale = transaction({
      id: "sale",
      sourceTransactionId: "source",
      type: TransactionType.SOLD,
    });
    vi.mocked(hasRole).mockReturnValue(true);
    vi.mocked(db.transaction.findUnique)
      .mockResolvedValueOnce(sale as never)
      .mockResolvedValueOnce(source as never);
    const result = await getTransactionExportForUser({} as CurrentUser, "sale");
    expect(result).toMatchObject({
      id: "sale",
      pdfSourceTransaction: { id: "source" },
    });
    expect(db.transaction.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "sale" },
        select: expect.objectContaining({
          approvals: expect.objectContaining({ where: { isCurrent: true } }),
        }),
      }),
    );
    expect(buildTransactionExportDocuments(result!)[0].transactionNo).toBe(
      "REQ-SOURCE",
    );
  });

  it("ignores archived pending approvals when checking export readiness", async () => {
    vi.mocked(hasRole).mockReturnValue(false);
    vi.mocked(db.transaction.findUnique).mockResolvedValue(
      transaction() as never,
    );
    vi.mocked(db.transactionApproval.count).mockResolvedValue(0);
    await getTransactionExportForUser({} as CurrentUser, "source");
    expect(db.transactionApproval.count).toHaveBeenCalledWith({
      where: {
        transactionId: "source",
        isCurrent: true,
        status: ApprovalStatus.PENDING,
        requiredTag: { notIn: ["ACK_BSD", "ACK_WAREHOUSE_MANAGER"] },
      },
    });
  });

  it("delegates the whole combined file to the existing generic PDF renderer", async () => {
    const pdf = Buffer.from("%PDF-1.4");
    vi.mocked(renderDocumentPdf).mockImplementation(async (builder) => {
      expect(builder({ regular: "file:///thai.ttf" })).toContain(
        "file:///thai.ttf",
      );
      return pdf;
    });
    await expect(renderTransactionExportPdf(transaction())).resolves.toBe(pdf);
  });
});
