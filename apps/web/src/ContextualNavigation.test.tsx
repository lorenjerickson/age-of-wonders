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
          sourceId: "grant-condition",
          resourceType: "world-conditions",
          payload: { id: "grant-condition", name: "Resolute" },
        },
        {
          sourceId: "grant-effect",
          resourceType: "world-effects",
          payload: { id: "grant-effect", name: "Steady hands" },
        },
        ...["profession", "background"].map((kind) => ({
          sourceId: `authored-${kind}`,
          resourceType: "definitions",
          payload: {
            kind,
            identity: {
              id: `authored-${kind}`,
              name: kind === "profession" ? "Artisan" : "Wayfarer",
              description: "A patient craftsperson.",
            },
            components: {
              grantedConditions: [{ conditionId: "grant-condition" }],
              grantedEffects: [{ effectId: "grant-effect" }],
              modifierGrants: [{ id: "existing-modifier" }],
            },
          },
        })),
        {
          sourceId: "legacy-creature",
          resourceType: "creatures",
          payload: { name: "Marsh beast", description: "A legacy creature" },
        },
        {
          sourceId: "named-character",
          resourceType: "world-character-templates",
          payload: {
            name: "Captain Rowan",
            creatureDefinitionId: "opaque-creature",
            attributes: {},
            skills: {},
            equipment: [],
            health: {},
            movement: {},
            vision: {},
          },
        },
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
      "Bestiary",
      "Characters",
      "Rules",
      "Items",
      "Conditions",
      "Effects",
      "Professions",
      "Skills",
      "Backgrounds",
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
      "Authoring libraries",
      "Rule system",
      "Profession ranks",
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

it("shows Codex children in the sidebar and preserves Versions from Overview", async () => {
  const html = await renderRoute(
    "/worlds/world-internal?view=codex&kind=conditions",
  );
  expect(html).not.toContain("Authoring libraries");
  expect(html).toContain('aria-label="Codex navigation"');
  expect(html).toContain(
    'aria-current="page" href="/worlds/world-internal?view=codex&amp;kind=conditions"',
  );
  for (const kind of ["professions", "skills", "backgrounds"]) {
    expect(html).toContain(`href="/worlds/world-internal/characters/${kind}"`);
  }
  const overview = await renderRoute("/worlds/world-internal?view=overview");
  expect(overview).toContain('href="/worlds/world-internal/versions"');
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
      `/worlds/world-internal?view=${kind === "creatures" ? "bestiary" : "items"}&entry=${id}`,
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

it.each([
  ["creatures", "bestiary"],
  ["characters", "characters"],
  ["items", "items"],
])(
  "redirects old Codex %s links without losing the selected entry",
  (kind, view) => {
    const href = astraWorldCompatibilityHref(
      "world-internal",
      "/worlds/world-internal",
      `?view=codex&kind=${kind}&entry=someone%2Fspecial&guide=1`,
    );
    expect(href).toBe(
      `/worlds/world-internal?view=${view}&entry=someone%2Fspecial&guide=1`,
    );
  },
);

it.each(["bestiary", "characters", "items"])(
  "opens %s as a primary workspace collection",
  async (view) => {
    const html = await renderRoute(`/worlds/world-internal?view=${view}`);
    expect(html).toContain(
      `aria-current="page" href="/worlds/world-internal?view=${view}" class="active"`,
    );
    expect(html).not.toContain('aria-label="Codex categories"');
    expect(html).toContain(
      `href="/worlds/world-internal?view=${view}&amp;entry=new"`,
    );
  },
);

it("uses the sidebar instead of Codex category tabs", async () => {
  const html = await renderRoute(
    "/worlds/world-internal?view=codex&kind=conditions",
  );
  expect(html).not.toContain('aria-label="Codex categories"');
  expect(html).toContain('aria-label="Codex navigation"');
});

it.each(["new", "opaque-creature"])(
  "uses the same Bestiary editor for legacy path %s",
  async (entry) => {
    const html = await renderRoute(
      `/worlds/world-internal/bestiary/creatures/${entry}`,
    );
    expect(html).toContain("Back to Bestiary");
    expect(html).toContain(entry === "new" ? "Add creature" : "Edit creature");
    expect(html).toContain(
      'aria-current="page" href="/worlds/world-internal?view=bestiary" class="active"',
    );
  },
);

it("separates the Bestiary and authored Characters while retaining legacy creatures", async () => {
  const bestiary = await renderRoute("/worlds/world-internal?view=bestiary");
  expect(bestiary).toContain("Marsh beast");
  expect(bestiary).not.toContain("Captain Rowan");
  const characters = await renderRoute(
    "/worlds/world-internal?view=characters",
  );
  expect(characters).toContain("Captain Rowan");
  expect(characters).not.toContain("Marsh beast");
  const legacy = await renderRoute(
    "/worlds/world-internal/bestiary/creatures/legacy-creature",
  );
  expect(legacy).toContain('value="Marsh beast"');
  expect(legacy).toContain("Save creature");
});

it.each(["professions", "skills", "backgrounds"])(
  "keeps %s editors under the active Codex child",
  async (kind) => {
    const html = await renderRoute(`/worlds/world-internal/characters/${kind}`);
    const link = (html.match(/<a[^>]*>/g) ?? []).find(
      (tag) =>
        tag.includes(`href="/worlds/world-internal/characters/${kind}"`) &&
        tag.includes('aria-current="page"'),
    );
    expect(link).toBeDefined();
    expect(link).toContain("active");
    expect(html).not.toContain(">Character options</a>");
  },
);
it.each([
  ["?view=system", "/rules"],
  ["?view=rules", "/rules"],
  ["?view=codex&kind=rules", "/rules"],
  ["?view=codex&kind=rules&entry=new", "/rules/new"],
  [
    "?view=codex&kind=rules&entry=rule%2Fone&guide=1",
    "/rules/rule%2Fone/edit?guide=1",
  ],
])("consolidates Rules alias %s", (search, target) => {
  expect(
    astraWorldCompatibilityHref(
      "world-internal",
      "/worlds/world-internal",
      search,
    ),
  ).toBe(`/worlds/world-internal${target}`);
});
it("shows the same complete Atlas from the legacy collection path", async () => {
  const html = await renderRoute("/worlds/world-internal/atlas");
  expect(html).toContain("London");
  expect(html).toContain(
    'href="/worlds/world-internal?view=atlas&amp;entry=location-internal"',
  );
  expect(html).toContain(
    'aria-current="page" href="/worlds/world-internal?view=atlas" class="active"',
  );
});

it("orders World and Codex navigation alphabetically with Items as a peer", async () => {
  const html = await renderRoute("/worlds/world-internal?view=items");
  const sidebar =
    html.match(
      /<aside[^>]*aria-label="Workspace navigation"[\s\S]*?<\/aside>/,
    )?.[0] ?? "";
  const children =
    sidebar.match(
      /<nav[^>]*aria-label="Codex navigation"[\s\S]*?<\/nav>/,
    )?.[0] ?? "";
  expect(children).not.toContain(">Items<");
  const childLabels = [
    ...children.matchAll(
      />(Backgrounds|Conditions|Effects|Professions|Skills)<\/a>/g,
    ),
  ].map((match) => match[1]);
  expect(childLabels).toEqual([
    "Backgrounds",
    "Conditions",
    "Effects",
    "Professions",
    "Skills",
  ]);
  const top = sidebar.replace(children, "");
  const destinations = [
    ...top.matchAll(
      /<span class="astra-nav-icon">[^<]*<\/span>(Atlas|Bestiary|Characters|Codex|Items|Overview|Rules)/g,
    ),
  ].map((match) => match[1]);
  expect(destinations).toEqual([
    "Atlas",
    "Bestiary",
    "Characters",
    "Codex",
    "Items",
    "Overview",
    "Rules",
  ]);
  expect(sidebar.indexOf("Export world")).toBeLessThan(
    sidebar.indexOf("People &amp; access"),
  );
  expect(sidebar).toContain(
    'aria-current="page" href="/worlds/world-internal?view=items" class="active"',
  );
});
it("opens the first alphabetic Codex child by default", () => {
  expect(
    astraWorldCompatibilityHref(
      "world-internal",
      "/worlds/world-internal",
      "?view=codex",
    ),
  ).toBe("/worlds/world-internal/characters/backgrounds");
});

it.each(["profession", "background"])(
  "shows %s description and benefits on the active collection and editor routes",
  async (kind) => {
    const list = await renderRoute(
      `/worlds/world-internal/characters/${kind}s`,
    );
    expect(list).toContain("A patient craftsperson.");
    expect(list).toContain(
      "1 modifier · Conditions: Resolute · Effects: Steady hands",
    );
    const editor = await renderRoute(
      `/worlds/world-internal/characters/${kind}s/authored-${kind}`,
    );
    expect(editor).toContain("Description");
    expect(editor).toContain('value="A patient craftsperson."');
    expect(editor).toContain("Granted Conditions");
    expect(editor).toContain("Granted Effects");
    expect(editor).toContain("Resolute");
    expect(editor).toContain("Steady hands");
    expect(editor).toContain(
      kind === "profession"
        ? "Manage Expertise tiers"
        : "Manage Modifier grants",
    );
  },
);
