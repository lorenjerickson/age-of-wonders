/// <reference types="vite/client" />

import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Age of Wonders SSR spike" },
      {
        name: "description",
        content: "TanStack Start SSR, SSG, routing, and deployment fixture.",
      },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: Outlet,
  errorComponent: ({ error }) => (
    <main className="shell">
      <section className="panel stack">
        <h1>Could not render this page</h1>
        <p className="error">{error.message}</p>
        <Link to="/">Return to the spike overview</Link>
      </section>
    </main>
  ),
  notFoundComponent: () => (
    <main className="shell">
      <section className="panel stack">
        <h1>Page not found</h1>
        <p className="muted">The requested spike route does not exist.</p>
        <Link to="/">Return to the spike overview</Link>
      </section>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
