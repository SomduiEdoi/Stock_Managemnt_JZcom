import { notFound } from "next/navigation";
import {
  AssetDetailForbidden,
  AssetDetailPage,
} from "@/features/asset-detail/asset-detail-page";
import { getAssetDetailForUser } from "@/lib/asset-detail";
import { requireCurrentUser } from "@/lib/auth";

type AssetDetailRouteProps = {
  params: Promise<{ id: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AssetDetailRoute({
  params,
}: AssetDetailRouteProps) {
  const { id } = await params;

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const user = await requireCurrentUser(`/dashboard/assets/${id}`);
  const result = await getAssetDetailForUser(user, id);

  if (result.kind === "notFound") {
    notFound();
  }

  if (result.kind === "forbidden") {
    return <AssetDetailForbidden />;
  }

  return <AssetDetailPage asset={result.asset} canManage={result.canManage} />;
}
