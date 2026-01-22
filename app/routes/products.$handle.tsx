import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { getProductByHandle } from "../lib/shopify.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const handle = params.handle;

  if (!handle) {
    throw new Response("Product handle missing", { status: 400 });
  }

  const product = await getProductByHandle(handle);

  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  return json({ product });
};

export default function ProductRoute() {
  const { product } = useLoaderData<typeof loader>();
  const variants = product.variants.nodes;
  const defaultVariant = variants.find((variant) => variant.availableForSale) ?? variants[0];
  const priceLabel = defaultVariant
    ? `${defaultVariant.price.amount} ${defaultVariant.price.currencyCode}`
    : "Unavailable";

  return (
    <section className="product-detail">
      <div>
        {product.featuredImage ? (
          <img
            src={product.featuredImage.url}
            alt={product.featuredImage.altText ?? product.title}
          />
        ) : (
          <div className="image-placeholder">No image</div>
        )}
      </div>
      <div className="detail-meta">
        <div>
          <h1>{product.title}</h1>
          <p className="price">{priceLabel}</p>
        </div>
        <Form method="post" action="/cart/add">
          <div>
            <label htmlFor="variant">Variant</label>
            <select id="variant" name="merchandiseId" defaultValue={defaultVariant?.id}>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id} disabled={!variant.availableForSale}>
                  {variant.title} {variant.availableForSale ? "" : "(Sold out)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quantity">Quantity</label>
            <input id="quantity" name="quantity" type="number" min={1} defaultValue={1} />
          </div>
          <button type="submit">Add to cart</button>
        </Form>
        {product.descriptionHtml ? (
          <div
            className="description"
            dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
          />
        ) : null}
      </div>
    </section>
  );
}
