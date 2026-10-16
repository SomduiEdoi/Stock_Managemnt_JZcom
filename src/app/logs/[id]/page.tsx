import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TransactionDetailRoute({ params }: PageProps) {
  const { id } = await params;
  redirect(`/logs/${id}/return`);
}
