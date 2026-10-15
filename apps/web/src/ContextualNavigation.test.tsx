import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { getRouter } from "./router";
import { astraWorldCompatibilityHref } from "./astraCompatibility";
import { Route as WorldRoute } from "./routes/_gm.worlds.$worldId";
import { WorldMapPage } from "./WorldMapPage";
import {
  CharacterModelsPage,
  WorldVersionsPage,
  WorldLocationPlacements,
} from "./WorldAuthoringPages";

// UI's built package resolves its own React in the Node test runner.
vi.mock("@aow/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aow/ui")>()),
  Checkbox: ({ checked, label }: { checked?: boolean; label?: string }) => (
    <div role="checkbox" aria-checked={checked}>
      {label}
    </div>
  ),
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
      {label}
      {children}
    </div>
  ),
}));

// Portals attach after hydration; render their content inline for server content assertions.
vi.mock("./AppShellTools", () => ({
  ShellTools: ({ children }: { children: ReactNode }) => children,
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
      id: "draft-internal",
      storageRevision: 1,
      revisionName: "Draft",
      content: {},
      records: [
        {
          sourceId: "opaque-item",
          resourceType: "definitions",
          payload: {
            kind: "item",
            identity: {
              id: "opaque-item",
              name: "opaque-item",
              description: "Reference: 550e8400-e29b-41d4-a716-446655440000",
            },
            modelValues: { "aow:item-family": "aow:tool" },
            components: { category: "tool", quality: "standard" },
          },
        },
        {
          sourceId: "opaque-creature",
          resourceType: "definitions",
          payload: {
            kind: "creature",
            identity: {
              id: "opaque-creature",
              name: "opaque-creature",
              description: "Reference: 550e8400-e29b-41d4-a716-446655440000",
            },
            components: {},
          },
        },
        {
          sourceId: "item-internal",
          resourceType: "definitions",
          payload: {
            kind: "item",
            identity: { id: "item-internal", name: "Lantern" },
            modelValues: { "aow:item-family": "aow:tool" },
            components: { category: "tool", quality: "standard" },
          },
        },
        {
          sourceId: "location-internal",
          resourceType: "locations",
          payload: {
            identity: { name: "London" },
            description: "Fog over the Thames",
            mapScene: { notes: "Fog over the Thames", orientation: "overhead" },
          },
        },
      ],
    },
  }),
}));

async function renderRoute(path: string) {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToString(<RouterProvider router={router} />).replace(
    /<!--.*?-->/g,
    "",
  );
}

function visibleText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, "");
}

describe("Astra World navigation", () => {
  it("renders a single compact workspace navigation with the Figma destinations", async () => {
    const html = await renderRoute("/worlds/world-internal?view=atlas");
    const sidebar =
      html.match(
        /<aside[^>]*aria-label="Workspace navigation"[\s\S]*?<\/aside>/,
      )?.[0] ?? "";
    expect(sidebar).not.toBe("");
    for (const destination of [
      "Overview",
      "Atlas",
      "Codex",
      "Rule system",
      "People &amp; access",
      "Export world",
    ]) {
      expect(sidebar).toContain(destination);
    }
    expect(sidebar).toContain("Age of Wonders");
    expect(sidebar).toContain('href="/worlds"');
    expect(sidebar).toContain('href="/worlds/world-internal?view=atlas"');
    expect(html).toContain('aria-label="Open navigation menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(
      (html.match(/aria-label="Workspace navigation"/g) ?? []).length,
    ).toBe(1);
    expect(html).not.toContain('aria-label="Primary navigation"');
    for (const excluded of [
      "Skills",
      "Professions",
      "Backgrounds",
      "Quick Start",
    ]) {
      expect(sidebar).not.toContain(excluded);
    }
    expect(visibleText(html)).not.toContain("world-internal");
    expect(visibleText(html)).not.toContain("location-internal");
  });

  it("keeps omitted feature components available in the code", () => {
    for (const component of [
      WorldMapPage,
      CharacterModelsPage,
      WorldVersionsPage,
      WorldLocationPlacements,
    ]) {
      expect(typeof component).toBe("function");
    }
  });
});

it.each([
  "/atlas",
  "/atlas/locations/new",
  "/atlas/locations/location-internal",
  "/atlas/locations/location-internal/map",
  "/atlas/locations/location-internal/discoveries/new",
  "/bestiary/creatures/new",
  "/bestiary/catalog-monsters/monster/actions/new",
  "/item-compendium/items/item/traits/trait/actions/action/outcomes/new",
  "/characters",
  "/characters/professions/new",
  "/characters/backgrounds/background/rule/choices/new",
  "/characters/skills/skill",
  "/characters/catalog-characters/template/traits/new",
  "/characters/model/structure/effective",
  "/rules/rule/effects/new",
  "/versions/draft/review",
])(
  "retains the canonical authoring context %s through the real parent route",
  (suffix) => {
    const pathname = `/worlds/world-internal${suffix}`;
    expect(
      astraWorldCompatibilityHref("world-internal", pathname),
    ).toBeUndefined();
    expect(() =>
      WorldRoute.options.beforeLoad?.({
        params: { worldId: "world-internal" },
        location: { pathname, searchStr: "" },
      } as never),
    ).not.toThrow();
  },
);

it("exposes retained authoring libraries through progressive disclosure", async () => {
  const html = await renderRoute("/worlds/world-internal?view=atlas");
  expect(html).toContain("Authoring libraries");
  for (const path of [
    "atlas",
    "bestiary",
    "item-compendium",
    "characters",
    "characters/models",
    "rules",
    "versions",
  ]) {
    expect(html).toContain(`href="/worlds/world-internal/${path}"`);
  }
});

it("leaves the current World query route untouched", () => {
  expect(
    astraWorldCompatibilityHref(
      "world-internal",
      "/worlds/world-internal",
      "?view=atlas",
    ),
  ).toBeUndefined();
});

it("opens existing map and terrain tools from the Atlas map action", async () => {
  const html = await renderRoute(
    "/worlds/world-internal?view=atlas&entry=location-internal&map=1",
  );
  expect(html).toContain("Back to location");
  expect(html).toContain("Map orientation");
  expect(html).toContain("Isometric");
  expect(html).toContain(
    'href="/worlds/world-internal?view=atlas&amp;entry=location-internal"',
  );
  expect(html).not.toContain("Connections");
});

it("renders removal on the editable canonical Item page", async () => {
  const html = await renderRoute(
    "/worlds/world-internal/item-compendium/items/item-internal",
  );
  expect(html).toContain("Remove entry");
  expect(html).toContain('aria-label="Remove entry"');
  expect(html).toContain("Save changes");
});

it.each([
  ["items", "opaque-item"],
  ["creatures", "opaque-creature"],
])(
  "masks imported %s text in the primary Astra editor without replacing raw fields",
  async (kind, id) => {
    const html = await renderRoute(
      `/worlds/world-internal?view=codex&kind=${kind}&entry=${id}`,
    );
    expect(html).toContain("Existing name preserved.");
    expect(html).toContain("Replace name");
    expect(html).toContain("Replace description");
    expect(html).not.toContain(`value="${id}"`);
    expect(visibleText(html)).not.toContain(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    if (kind === "creatures")
      expect(visibleText(html)).not.toContain("opaque-item");
  },
);
