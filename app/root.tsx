import type { LinksFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

import styles from "./styles.css";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="app-shell">
          <header className="site-header">
            <div className="brand">
              <a href="/">MyNodeShop</a>
              <span className="tagline">Inventory-first storefront</span>
            </div>
            <nav className="site-nav">
              <a href="/collections/all">All products</a>
              <a href="/cart">Cart</a>
            </nav>
          </header>
          <main className="main-content">
            <Outlet />
          </main>
          <footer className="site-footer">
            <span>Headless Shopify storefront</span>
          </footer>
        </div>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
