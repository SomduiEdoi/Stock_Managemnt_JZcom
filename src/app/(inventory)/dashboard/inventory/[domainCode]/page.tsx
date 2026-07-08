import { DomainInventoryPage } from "@/features/domain-inventory/domain-inventory-page";

type PageProps = {
  params: Promise<{ domainCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InventoryDomainPage({ params, searchParams }: PageProps) {
  const { domainCode } = await params;

  return <DomainInventoryPage domainCode={decodeURIComponent(domainCode)} searchParams={searchParams} />;
}
