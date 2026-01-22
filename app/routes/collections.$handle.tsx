import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { getCollectionByHandle } from "../lib/shopify.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const handle = params.handle;

  if (!handle) {
    throw new Response("Collection handle missing", { status: 400 });
  }

  const collection = await getCollectionByHandle(handle);

  if (!collection) {
    throw new Response("Collection not found", { status: 404 });
  }

  return json({ collection });
};

export default function CollectionRoute() {
  const { collection } = useLoaderData<typeof loader>();

  return (
    <section>
      <div className="section-header">
        <h1 className="section-title">{collection.title}</h1>
        <p className="section-subtitle">
          {collection.description || "Collection"}
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
