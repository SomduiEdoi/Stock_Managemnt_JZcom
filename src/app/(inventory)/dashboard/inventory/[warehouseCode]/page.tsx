import { WarehouseInventoryPage } from "@/features/warehouse-inventory/warehouse-inventory-page";

type PageProps = {
  params: Promise<{ warehouseCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InventoryWarehousePage({ params, searchParams }: PageProps) {
  const { warehouseCode } = await params;

  return <WarehouseInventoryPage warehouseCode={decodeURIComponent(warehouseCode)} searchParams={searchParams} />;
}
