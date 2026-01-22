import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { addCartLines, createCart } from "../lib/shopify.server";
import { commitSession, getSession } from "../sessions.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const merchandiseId = String(formData.get("merchandiseId") || "");
  const quantityValue = Number(formData.get("quantity") || 1);
  const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1;
  if (!merchandiseId) {
    throw new Response("Missing merchandiseId", { status: 400 });
  }

  const session = await getSession(request);
  let cartId = session.get("cartId") as string | undefined;

  if (!cartId) {
    const cart = await createCart([{ merchandiseId, quantity }]);
    cartId = cart.id;
  } else {
    await addCartLines(cartId, [{ merchandiseId, quantity }]);
  }

  session.set("cartId", cartId);

  return redirect("/cart", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
};
