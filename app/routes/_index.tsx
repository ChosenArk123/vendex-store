import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { getCollectionByHandle } from "../lib/shopify.server";

const FEATURED_COLLECTION_HANDLE = "frontpage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const collection = await getCollectionByHandle(FEATURED_COLLECTION_HANDLE);

  if (!collection) {
    throw new Response("Featured collection not found", { status: 404 });
  }

  return json({ collection });
};

export default function IndexRoute() {
  const { collection } = useLoaderData<typeof loader>();

  return (
    <section>
      <div className="section-header">
        <h1 className="section-title">{collection.title}</h1>
        <p className="section-subtitle">
          TODO: Update `FEATURED_COLLECTION_HANDLE` in `app/routes/_index.tsx`.
        </p>
      </div>
      <div className="product-grid">
        {collection.products.nodes.map((product) => (
          <article key={product.id} className="product-card">
            <Link to={`/products/${product.handle}`}>
              {product.featuredImage ? (
                <img
                  src={product.featuredImage.url}
                  alt={product.featuredImage.altText ?? product.title}
                  loading="lazy"
                />
              ) : (
                <div className="image-placeholder">No image</div>
              )}
              <h3>{product.title}</h3>
            </Link>
            <span className="price">
              {product.priceRange.minVariantPrice.amount} {product.priceRange.minVariantPrice.currencyCode}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
