import { notFound } from "next/navigation";
import {
  AssetEditForbidden,
  AssetEditPage,
} from "@/features/asset-edit/asset-edit-page";
import { getAssetEditForUser } from "@/lib/asset-edit";
import { requireCurrentUser } from "@/lib/auth";

type AssetEditRouteProps = {
  params: Promise<{ id: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AssetEditRoute({
  params,
}: AssetEditRouteProps) {
  const { id } = await params;

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const user = await requireCurrentUser(`/dashboard/assets/${id}/edit`);
  const result = await getAssetEditForUser(user, id);

  if (result.kind === "notFound") {
    notFound();
  }

  if (result.kind === "forbidden") {
    return <AssetEditForbidden />;
  }

  return (
    <AssetEditPage
      asset={result.asset}
      canChangeDomain={result.canChangeDomain}
      options={result.options}
    />
  );
}
