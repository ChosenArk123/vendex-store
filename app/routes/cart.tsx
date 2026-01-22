import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { getCart } from "../lib/shopify.server";
import { commitSession, getSession } from "../sessions.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await getSession(request);
  const cartId = session.get("cartId") as string | undefined;

  if (!cartId) {
    return json({ cart: null });
  }

  const cart = await getCart(cartId);

  if (!cart) {
    session.unset("cartId");
    return json(
      { cart: null },
      { headers: { "Set-Cookie": await commitSession(session) } }
    );
  }

  return json({ cart });
};

export default function CartRoute() {
  const { cart } = useLoaderData<typeof loader>();

  if (!cart || cart.lines.nodes.length === 0) {
    return (
      <section>
        <div className="section-header">
          <h1 className="section-title">Cart</h1>
          <p className="section-subtitle">Cart is empty.</p>
        </div>
        <Link to="/collections/all" className="price">
          Browse products
        </Link>
      </section>
    );
  }

  return (
    <section>
      <div className="section-header">
        <h1 className="section-title">Cart</h1>
        <p className="section-subtitle">Checkout on Shopify.</p>
      </div>
      <div className="cart-list">
        {cart.lines.nodes.map((line) => (
          <div key={line.id} className="cart-item">
            <div className="cart-item-info">
              <strong>{line.merchandise.product.title}</strong>
              <span>{line.merchandise.title}</span>
              <span className="price">
                {line.merchandise.price.amount} {line.merchandise.price.currencyCode}
              </span>
            </div>
            <span className="price">Qty {line.quantity}</span>
          </div>
        ))}
      </div>
      <div className="cart-total">
        <span>Total</span>
        <span>
          {cart.cost.totalAmount.amount} {cart.cost.totalAmount.currencyCode}
        </span>
      </div>
      <div className="checkout-actions">
        <a href={cart.checkoutUrl} className="button-link">
          Checkout
        </a>
      </div>
    </section>
  );
}
