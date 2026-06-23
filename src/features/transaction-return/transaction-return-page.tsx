import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import {
  getTransactionResolutionForUser,
  WorkflowError,
} from "@/lib/workflow";
import {
  TransactionReturnClient,
  type TransactionReturnRecord,
} from "@/features/transaction-return/transaction-return-client";

type TransactionReturnPageProps = {
  transactionId: string;
};

function personName(person: { email: string; name: string } | null | undefined) {
  if (!person) {
    return "-";
  }

  return person.name || person.email || "-";
}

function serializeTransaction(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
): TransactionReturnRecord {
  return {
    id: transaction.id,
    items: transaction.items.map((item) => ({
      assetId: item.asset.id,
      brand: item.asset.assetModel.brand,
      currentStatus: item.asset.status,
      itemId: item.id,
      model: item.asset.assetModel.name,
      note: item.note,
      resolvedAt: item.returnedAt?.toISOString() ?? null,
      resolvedStatus: item.resolvedStatus,
      resolutionNote: item.resolutionNote,
      serialNo: item.asset.serialNo,
      stockCode: item.asset.stockCode,
    })),
    requestedBy: personName(transaction.requestedBy),
    transactionNo: transaction.transactionNo ?? transaction.id,
    type: transaction.type,
  };
}

export async function TransactionReturnPage({
  transactionId,
}: TransactionReturnPageProps) {
  const user = await requireCurrentUser(`/logs/${transactionId}/return`);

  try {
    const transaction = await getTransactionResolutionForUser(user, transactionId);

    return (
      <TransactionReturnClient transaction={serializeTransaction(transaction)} />
    );
  } catch (error) {
    if (error instanceof WorkflowError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
