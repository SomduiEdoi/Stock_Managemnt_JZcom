import {
  ApprovalStatus,
  Prisma,
  TransactionWorkflowStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";
import {
  buildTransactionDocumentHtml,
  buildUnifiedRequisitionHtml,
  type PrintableTransaction,
  type TransactionDocumentFontUrls,
} from "@/features/transactions/transaction-document";
import { renderDocumentPdf } from "@/lib/transaction-pdf";

const outcomeExportSelect =
  Prisma.validator<Prisma.TransactionItemOutcomeSelect>()({
    id: true,
    assetId: true,
    transactionItemId: true,
    quantity: true,
    outcomeStatus: true,
    approvedAt: true,
    resolutionBatchId: true,
    soldTransactionId: true,
    soldPrice: true,
    soldTotal: true,
    note: true,
  });

const transactionDocumentSelect = Prisma.validator<Prisma.TransactionSelect>()({
  completedAt: true,
  createdAt: true,
  documentRef: true,
  dueDate: true,
  id: true,
  internalRequest: true,
  note: true,
  project: {
    select: { id: true, name: true, customerName: true, projectId: true },
  },
  projectId: true,
  projectRequest: true,
  purpose: true,
  requestDate: true,
  requestedBy: { select: { email: true, name: true, signatureDataUrl: true } },
  returnedAt: true,
  serviceRequest: true,
  soldPrice: true,
  sourceTransactionId: true,
  sourceTransaction: {
    select: {
      documentRef: true,
      id: true,
      transactionNo: true,
    },
  },
  status: true,
  workflowStatus: true,
  transactionNo: true,
  type: true,
  approvals: {
    where: { isCurrent: true },
    orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
    select: {
      actedAt: true,
      isCurrent: true,
      approverNameSnapshot: true,
      approverSignatureSnapshot: true,
      requiredTag: true,
      resolutionBatchId: true,
      status: true,
      stepSequence: true,
      user: { select: { email: true, name: true, signatureDataUrl: true } },
    },
  },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assetId: true,
      assetModelId: true,
      note: true,
      requestedQuantity: true,
      resolutionNote: true,
      soldPrice: true,
      soldTotal: true,
      salePriceGroups: true,
      resolvedStatus: true,
      returnedAt: true,
      outcomes: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: outcomeExportSelect,
      },
      assetModel: {
        select: {
          isSerialized: true,
          name: true,
          description: true,
          typeName: true,
        },
      },
      asset: {
        select: {
          id: true,
          locationText: true,
          serialNo: true,
          stockCode: true,
          warehouse: {
            select: { code: true, name: true },
          },
          location: { select: { name: true } },
          assetModel: {
            select: {
              isSerialized: true,
              brand: true,
              category: { select: { name: true } },
              description: true,
              name: true,
              typeName: true,
            },
          },
        },
      },
    },
  },
  outcomeSales: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: outcomeExportSelect,
  },
  returnBatches: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, requestNo: true, createdAt: true, state: true },
  },
});

const transactionExportSelect = Prisma.validator<Prisma.TransactionSelect>()({
  ...transactionDocumentSelect,
  derivedTransactions: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: transactionDocumentSelect,
  },
});

type TransactionDocumentRecord = Prisma.TransactionGetPayload<{
  select: typeof transactionDocumentSelect;
}>;

export type TransactionExportRecord = Prisma.TransactionGetPayload<{
  select: typeof transactionExportSelect;
}>;

export type TransactionExportResult = TransactionExportRecord & {
  pdfSourceTransaction?: TransactionExportRecord;
};

function scopedDocument(
  transaction: TransactionDocumentRecord,
  batchId: string | null,
): PrintableTransaction {
  const approvals = transaction.approvals.filter(
    (approval) =>
      approval.isCurrent &&
      approval.resolutionBatchId === batchId &&
      approval.status === ApprovalStatus.APPROVED,
  );
  const requester = approvals.find(
    (approval) => approval.requiredTag === "REQUESTER",
  );
  return {
    ...transaction,
    requestDate: requester?.actedAt ?? transaction.requestDate,
    requestedBy: {
      ...transaction.requestedBy,
      name:
        requester?.approverNameSnapshot ??
        requester?.user?.name ??
        transaction.requestedBy.name,
      signatureDataUrl: requester?.approverSignatureSnapshot ?? null,
    },
    approvals: approvals
      .filter(
        (approval) =>
          approval.requiredTag !== "REQUESTER" &&
          !approval.requiredTag.startsWith("RETURN_CHECK:"),
      )
      .map((approval) => ({
        ...approval,
        user: {
          email: approval.user?.email,
          name: approval.approverNameSnapshot ?? approval.user?.name,
          signatureDataUrl: null,
        },
      })),
  };
}

export function buildTransactionExportDocuments(
  requestedTransaction: TransactionExportResult,
): PrintableTransaction[] {
  const transaction =
    requestedTransaction.pdfSourceTransaction ?? requestedTransaction;
  const issue = scopedDocument(transaction, null);
  if (transaction.type === "SOLD") return [issue];

  const documents: PrintableTransaction[] = [
    {
      ...issue,
      sourceTransactionId: null,
      sourceTransaction: null,
      status: transaction.type === "BORROW" ? "BORROWED" : "USING",
      returnedAt: null,
      items: transaction.items.map((item) => ({
        ...item,
        returnedAt: null,
        resolvedStatus: null,
        outcomes: [],
      })),
    },
  ];
  const batches = new Map<
    string | null,
    NonNullable<PrintableTransaction["items"]>
  >();
  for (const item of transaction.items) {
    for (const outcome of item.outcomes) {
      if (!outcome.approvedAt || outcome.outcomeStatus === "SOLD") continue;
      const rows = batches.get(outcome.resolutionBatchId) ?? [];
      rows.push({
        ...item,
        requestedQuantity: outcome.quantity,
        resolutionNote: outcome.note,
        resolvedStatus: outcome.outcomeStatus,
        returnedAt: outcome.approvedAt,
        outcomes: [{ resolutionBatchId: outcome.resolutionBatchId }],
      });
      batches.set(outcome.resolutionBatchId, rows);
    }
    if (
      !item.outcomes.length &&
      item.returnedAt &&
      item.resolvedStatus !== "SOLD"
    ) {
      const rows = batches.get(null) ?? [];
      rows.push({ ...item, outcomes: [] });
      batches.set(null, rows);
    }
  }
  for (const [batchId, items] of batches) {
    const batch = transaction.returnBatches.find(
      (candidate) => candidate.id === batchId,
    );
    const scoped = scopedDocument(transaction, batchId);
    documents.push({
      ...scoped,
      transactionNo: batch?.requestNo ?? transaction.transactionNo,
      sourceTransactionId: transaction.id,
      sourceTransaction: null,
      requestDate:
        transaction.approvals.find(
          (approval) =>
            approval.isCurrent &&
            approval.resolutionBatchId === batchId &&
            approval.requiredTag === "REQUESTER" &&
            approval.status === ApprovalStatus.APPROVED,
        )?.actedAt ??
        batch?.createdAt ??
        scoped.requestDate,
      status: "RETURNED",
      note: [
        transaction.note,
        `Source Request: ${transaction.transactionNo ?? transaction.documentRef ?? transaction.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      // A legacy return with no batch must never borrow the issue signatures.
      approvals: batchId ? scoped.approvals : [],
      requestedBy: batchId
        ? scoped.requestedBy
        : { ...transaction.requestedBy, signatureDataUrl: null },
      items,
    });
  }

  for (const derived of transaction.derivedTransactions) {
    if (
      derived.type !== "SOLD" ||
      derived.workflowStatus !== TransactionWorkflowStatus.COMPLETED
    )
      continue;
    const groups = new Map<string | null, typeof derived.outcomeSales>();
    for (const outcome of derived.outcomeSales) {
      if (!outcome.approvedAt) continue;
      const group = groups.get(outcome.resolutionBatchId) ?? [];
      group.push(outcome);
      groups.set(outcome.resolutionBatchId, group);
    }
    if (!derived.outcomeSales.length) {
      const batchIds = [
        ...new Set(
          derived.approvals
            .filter((approval) => approval.isCurrent)
            .map((approval) => approval.resolutionBatchId),
        ),
      ];
      documents.push(
        scopedDocument(derived, batchIds.length === 1 ? batchIds[0] : null),
      );
    }
    for (const [batchId, outcomes] of groups) {
      const sale = scopedDocument(derived, batchId);
      documents.push({
        ...sale,
        sourceTransactionId: transaction.id,
        sourceTransaction: {
          id: transaction.id,
          transactionNo: transaction.transactionNo,
          documentRef: transaction.documentRef,
        },
        // Let the template add FROM exactly once from the source reference.
        transactionNo:
          transaction.transactionNo ??
          transaction.documentRef ??
          transaction.id,
        soldPrice: sale.soldPrice,
        items: outcomes.map((outcome) => {
          const original = transaction.items.find(
            (item) => item.id === outcome.transactionItemId,
          );
          if (!original)
            throw new Error(
              "Sale outcome does not belong to the exported source transaction.",
            );
          const assetId = outcome.assetId ?? original.assetId;
          const matchingItems = derived.items.filter((item) =>
            assetId
              ? item.assetId === assetId
              : Boolean(original.assetModelId) &&
                item.assetModelId === original.assetModelId,
          );
          const saleItem =
            matchingItems.length === 1 ? matchingItems[0] : undefined;
          return {
            ...original,
            asset: saleItem?.asset ?? original.asset,
            assetModel: saleItem?.assetModel ?? original.assetModel,
            requestedQuantity: outcome.quantity,
            soldPrice: saleItem?.soldPrice ?? outcome.soldPrice,
            soldTotal: saleItem?.soldTotal ?? outcome.soldTotal,
            salePriceGroups: saleItem?.salePriceGroups,
            returnedAt: outcome.approvedAt,
            resolvedStatus: "SOLD",
            outcomes: [{ resolutionBatchId: batchId }],
          };
        }),
      });
    }
  }
  return documents;
}

export function buildTransactionExportDocumentHtml(
  transaction: TransactionExportResult,
  fontUrls: TransactionDocumentFontUrls = {},
) {
  const documents = buildTransactionExportDocuments(transaction);
  const requisitions = documents.filter((document) => document.type !== "SOLD");
  const sales = documents.filter((document) => document.type === "SOLD");
  const htmlDocuments = [
    ...(requisitions.length ? [buildUnifiedRequisitionHtml(requisitions, fontUrls)] : []),
    ...sales.map((document) => buildTransactionDocumentHtml(document, fontUrls)),
  ];
  const first = htmlDocuments[0];
  const pages = htmlDocuments
    .map((html) => {
      const body = html.match(/<body>([\s\S]*?)<\/body>/);
      if (!body)
        throw new Error("Transaction document template has no body slot.");
      return body[1];
    })
    .join("");
  return first.replace(/<body>[\s\S]*?<\/body>/, () => `<body>${pages}</body>`);
}

export async function renderTransactionExportPdf(
  transaction: TransactionExportResult,
): Promise<Buffer> {
  return renderDocumentPdf((fontUrls) =>
    buildTransactionExportDocumentHtml(transaction, fontUrls),
  );
}

export async function getTransactionExportForUser(
  user: CurrentUser,
  transactionId: string,
) {
  const transaction = await db.transaction.findUnique({
    select: transactionExportSelect,
    where: { id: transactionId },
  });

  if (!transaction) return null;

  if (!hasRole(user, "ADMIN") && !hasRole(user, "STOREMAN")) {
    const pendingApproval = await db.transactionApproval.count({
      where: {
        transactionId,
        isCurrent: true,
        status: ApprovalStatus.PENDING,
        requiredTag: { notIn: ["ACK_BSD", "ACK_WAREHOUSE_MANAGER"] },
      },
    });
    if (
      transaction.workflowStatus === TransactionWorkflowStatus.PENDING ||
      pendingApproval > 0
    ) {
      throw new WorkflowError(
        "PDF export is available after the approval is completed.",
        403,
        "PDF_EXPORT_NOT_READY",
      );
    }
  }

  if (transaction.sourceTransactionId) {
    const source = await db.transaction.findUnique({
      where: { id: transaction.sourceTransactionId },
      select: transactionExportSelect,
    });
    if (source) return { ...transaction, pdfSourceTransaction: source };
  }

  return transaction;
}
