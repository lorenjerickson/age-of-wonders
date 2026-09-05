/// <reference types="vite/client" />

import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import styles from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Age of Wonders" },
      {
        name: "description",
        content: "Build worlds, campaigns, characters, and sessions.",
      },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: Outlet,
  pendingComponent: () => (
    <main className="grid min-h-dvh place-items-center bg-base-100 text-base-content">
      <p className="text-sm text-base-content/55">Loading…</p>
    </main>
  ),
  errorComponent: () => (
    <main className="grid min-h-dvh place-items-center bg-base-100 px-6 text-base-content">
      <section className="max-w-lg text-center">
        <h1 className="text-3xl font-semibold">Could not open this page</h1>
        <p className="mt-3 text-base-content/55">
          The application is temporarily unavailable. Try again shortly.
        </p>
        <Link to="/" className="btn btn-primary mt-6">
          Return home
        </Link>
      </section>
    </main>
  ),
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center bg-base-100 px-6 text-base-content">
      <section className="max-w-lg text-center">
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 text-base-content/55">
          That page is unavailable or no longer exists.
        </p>
        <Link to="/" className="btn btn-primary mt-6">
          Return home
        </Link>
      </section>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="aow">
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
