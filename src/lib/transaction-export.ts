import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

const transactionExportSelect = Prisma.validator<Prisma.TransactionSelect>()({
  completedAt: true,
  createdAt: true,
  documentRef: true,
  dueDate: true,
  id: true,
  internalRequest: true,
  note: true,
  project: { select: { id: true, name: true, projectId: true } },
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
  transactionNo: true,
  type: true,
  approvals: {
    orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
    select: {
      actedAt: true,
      requiredTag: true,
      status: true,
      stepSequence: true,
      user: { select: { email: true, name: true, signatureDataUrl: true } },
    },
  },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      note: true,
      requestedQuantity: true,
      resolutionNote: true,
      soldPrice: true,
      resolvedStatus: true,
      returnedAt: true,
      asset: {
        select: {
          id: true,
          locationText: true,
          serialNo: true,
          stockCode: true,
          domain: { select: { code: true, inventoryFamily: true, name: true } },
          location: { select: { name: true } },
          assetModel: {
            select: {
              assetType: { select: { trackMethod: true } },
              brand: true,
              category: { select: { name: true } },
              name: true,
              typeName: true,
            },
          },
        },
      },
    },
  },
});

export type TransactionExportRecord = Prisma.TransactionGetPayload<{
  select: typeof transactionExportSelect;
}>;

export async function getTransactionExportForUser(
  user: CurrentUser,
  transactionId: string,
) {
  const transaction = await db.transaction.findUnique({
    select: transactionExportSelect,
    where: { id: transactionId },
  });

  void user;

  return transaction;
}
