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
  projectRequest: true,
  purpose: true,
  requestDate: true,
  requestedBy: { select: { email: true, name: true } },
  returnedAt: true,
  serviceRequest: true,
  soldPrice: true,
  status: true,
  transactionNo: true,
  type: true,
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      asset: {
        select: {
          id: true,
          locationText: true,
          serialNo: true,
          stockCode: true,
          domain: { select: { code: true, name: true } },
          location: { select: { name: true } },
          assetModel: {
            select: {
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
