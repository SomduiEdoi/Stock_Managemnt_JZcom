import {
  AssetCreateForbidden,
  AssetCreatePage,
} from "@/features/assets/asset-edit-page";
import { getAssetCreateForUser } from "@/lib/asset-edit";
import { requireCurrentUser } from "@/lib/auth";

type AssetCreateRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AssetCreateRoute({
  searchParams,
}: AssetCreateRouteProps) {
  const params = await searchParams;
  const rawDomain = params.domain;
  const domain = Array.isArray(rawDomain) ? rawDomain[0] : rawDomain;
  const lockDomain = domain === "SERVER" || domain === "NETWORK";

  const user = await requireCurrentUser("/dashboard/assets/new");
  const result = await getAssetCreateForUser(user, domain);

  if (result.kind === "forbidden") {
    return <AssetCreateForbidden />;
  }

  return (
    <AssetCreatePage
      canChangeDomain={result.canChangeDomain}
      initialDomainCode={result.initialDomainCode}
      lockDomain={lockDomain}
      options={result.options}
    />
  );
}
