type TransactionReference = {
  transactionNo?: string | null;
  documentRef?: string | null;
  type: string;
  sourceTransactionId?: string | null;
  sourceTransaction?: { transactionNo?: string | null; documentRef?: string | null } | null;
};

export function formatTransactionReference(transaction: TransactionReference) {
  if (transaction.type === "SOLD" && transaction.sourceTransactionId && !transaction.transactionNo) {
    const source = transaction.sourceTransaction?.transactionNo ?? transaction.sourceTransaction?.documentRef;
    return source ? `From ${source}` : "-";
  }
  return transaction.transactionNo ?? transaction.documentRef ?? "-";
}
