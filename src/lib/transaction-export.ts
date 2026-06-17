import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { getVisibleDomainCodes } from "@/lib/assets";
import { db } from "@/lib/db";

const transactionExportSelect = Prisma.validator<Prisma.TransactionSelect>()({
  completedAt: true,
  createdAt: true,
  documentRef: true,
  dueDate: true,
  id: true,
  note: true,
  purpose: true,
  requestedBy: { select: { email: true, name: true } },
  returnedAt: true,
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

  if (!transaction) {
    return null;
  }

  const visibleDomainCodes = new Set(getVisibleDomainCodes(user));
  const visibleItems = transaction.items.filter((item) =>
    visibleDomainCodes.has(item.asset.domain.code),
  );

  return visibleItems.length > 0
    ? { ...transaction, items: visibleItems }
    : null;
}
