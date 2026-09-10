import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { getRouter } from "./router";

// UI's built package resolves its own React in the Node test runner.
vi.mock("@aow/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aow/ui")>()),
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
      {label}
      {children}
    </div>
  ),
}));

vi.mock("./index.css?url", () => ({ default: "/test.css" }));

vi.mock("./server/readModels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./server/readModels")>()),
  readGmShell: async () => ({
    session: {
      authenticated: true,
      user: { role: "gm", displayName: "GM", systemAdministrator: false },
    },
  }),
  readWorldAuthoring: async () => ({
    found: true,
    definition: {
      id: "world-internal",
      name: "Age of Wonders",
      status: "active",
      revisions: [],
    },
    draft: {
      storageRevision: 1,
      revisionName: "Draft",
      content: {},
      records: [
        {
          sourceId: "location-internal",
          resourceType: "locations",
          payload: {
            identity: { name: "London" },
            mapScene: { notes: "Fog over the Thames", orientation: "overhead" },
          },
        },
      ],
    },
  }),
}));

describe("contextual GM rendering", () => {
  it("renders only the Location sidebar, contextual breadcrumbs, and the actual nested Map editor", async () => {
    const router = getRouter();
    router.update({
      history: createMemoryHistory({
        initialEntries: [
          "/worlds/world-internal/atlas/locations/location-internal/map",
        ],
      }),
    });
    await router.load();
    const html = renderToString(<RouterProvider router={router} />);
    expect(html.replace(/<!--.*?-->/g, "")).toContain("Back to Age of Wonders");
    expect(html).toContain('aria-label="London navigation"');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("Fog over the Thames");
    expect(html).toContain("Save Map");
    expect(html).not.toContain('aria-label="Primary navigation"');
    expect(html).not.toContain('aria-label="Age of Wonders navigation"');
    expect(html).not.toContain("Choose a workspace to begin");
    expect((html.match(/<aside/g) ?? []).length).toBe(1);
    const visible = html.replace(/<[^>]*>/g, "");
    expect(visible).not.toContain("world-internal");
    expect(visible).not.toContain("location-internal");
  });
});

it.each([
  ["", "Player-facing description", "Map or scene notes"],
  ["discoveries", "Add discovery", "Map or scene notes"],
  ["connections", "Child Locations", "Map or scene notes"],
  ["creatures", "Add placement", "Player-facing description"],
  ["items", "Add placement", "Player-facing description"],
])(
  "renders the distinct %s Location section with the same breadcrumb trail",
  async (section, expected, absent) => {
    const router = getRouter();
    router.update({
      history: createMemoryHistory({
        initialEntries: [
          `/worlds/world-internal/atlas/locations/location-internal${section ? `/${section}` : ""}`,
        ],
      }),
    });
    await router.load();
    const html = renderToString(<RouterProvider router={router} />);
    const content = html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? "";
    expect(content).toContain(expected);
    expect(content).not.toContain(absent);
    const breadcrumb =
      html.match(/<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(breadcrumb).toContain("London");
    expect(breadcrumb).not.toContain("Discoveries");
    expect(breadcrumb).not.toContain("Connections");
  },
);
