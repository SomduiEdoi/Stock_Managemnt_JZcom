import { TransactionReturnPage } from "@/features/transaction-return/transaction-return-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ReturnTransactionPage({ params }: PageProps) {
  const { id } = await params;

  return <TransactionReturnPage transactionId={id} />;
}
