import { requireCurrentUser } from "@/lib/auth";
import { RequestCartForbidden, RequestCartPage } from "@/features/request-cart/request-cart-page";
import { getRequestCartForUser } from "@/lib/request-cart";

export default async function RequestRoute() {
  const user = await requireCurrentUser("/request");
  const result = await getRequestCartForUser(user);

  if (!result.canRequest) {
    return <RequestCartForbidden />;
  }

  return <RequestCartPage assets={result.assets} user={user} />;
}
