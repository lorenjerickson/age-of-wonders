import { describe, expect, it } from "vitest";
import {
  contextualBreadcrumbs,
  contextualNavigationStack,
} from "./contextualNavigationModel";

const data = {
  worldName: "Age of Wonders",
  records: [
    {
      sourceId: "secret-location",
      resourceType: "locations",
      payload: { identity: { name: "London" } },
    },
  ],
};
const mapPath = "/worlds/secret-world/atlas/locations/secret-location/map";
describe("contextual navigation stack", () => {
  it("reconstructs the Location sidebar on direct Map entry and pops back to each parent", () => {
    const stack = contextualNavigationStack(mapPath, data);
    expect(stack.map((frame) => frame.label)).toEqual([
      "GM Workspace",
      "Worlds",
      "Age of Wonders",
      "London",
    ]);
    for (let index = 0; index < stack.length; index++) {
      expect(
        contextualNavigationStack(stack[index].href, data).map(
          ({ label, href }) => ({ label, href }),
        ),
      ).toEqual(
        stack.slice(0, index + 1).map(({ label, href }) => ({ label, href })),
      );
    }
    expect(stack.at(-1)?.links).toContainEqual({ label: "Map", href: mapPath });
    expect(
      contextualBreadcrumbs(mapPath, stack).map((crumb) => crumb.label),
    ).toEqual(stack.map((frame) => frame.label));
  });
  it("keeps World sections in the World sidebar without adding the selected section to breadcrumbs", () => {
    const stack = contextualNavigationStack(
      "/worlds/secret-world/bestiary",
      data,
    );
    expect(stack.at(-1)?.kind).toBe("World");
    expect(
      contextualBreadcrumbs("/worlds/secret-world/bestiary", stack).at(-1)
        ?.label,
    ).toBe("Age of Wonders");
    expect(stack.at(-1)?.groups?.find((group) => group.active)?.label).toBe(
      "Bestiary",
    );
  });
  it("never uses unknown URL identifiers as labels", () => {
    for (const path of [
      mapPath,
      "/campaigns/instances/secret-instance/sessions/secret-session",
      "/worlds/secret-world/characters/skills/secret-skill",
    ]) {
      const stack = contextualNavigationStack(path);
      const labels = [
        ...stack.map((entry) => entry.label),
        ...contextualBreadcrumbs(path, stack).map((entry) => entry.label),
      ];
      expect(labels.join(" ")).not.toContain("secret-");
    }
  });
  it("builds distinct library, creation, Campaign, and record contexts", () => {
    expect(contextualNavigationStack("/worlds").at(-1)?.label).toBe("Worlds");
    expect(contextualNavigationStack("/worlds/new").at(-1)?.label).toBe(
      "Create World",
    );
    expect(
      contextualNavigationStack("/campaigns/definitions/new").at(-1)?.label,
    ).toBe("Create Campaign Definition");
    expect(
      contextualNavigationStack("/campaigns/instances/instance", {
        instanceName: "Winter",
      }).map((entry) => entry.label),
    ).toEqual(["GM Workspace", "Campaigns", "Winter"]);
    expect(
      contextualNavigationStack("/players").map((entry) => entry.label),
    ).toEqual(["GM Workspace", "Players"]);
  });
});

const campaignData = {
  campaignName: "The Bells",
  locations: [{ id: "opaque-location", name: "Flooded harbor" }],
  records: [
    {
      resourceType: "plots",
      sourceId: "opaque-plot",
      payload: {
        name: "Find the bell",
        objectives: [{ id: "opaque-objective", name: "Reach the tower" }],
        discoveries: [
          {
            id: "opaque-discovery",
            name: "The inscription",
            claims: [
              { id: "opaque-claim", statement: "The bell opens the gate" },
            ],
          },
        ],
        locationContexts: [
          { id: "opaque-context", locationId: "opaque-location" },
        ],
      },
    },
    {
      resourceType: "campaign-placements",
      sourceId: "opaque-placement",
      payload: { name: "Harbor keeper" },
    },
  ],
};
describe("Plot collection navigation", () => {
  const base = "/campaigns/definitions/opaque-campaign/plots/opaque-plot";
  it("restores every collection and named child from a direct URL", () => {
    const stack = contextualNavigationStack(
      `${base}/objectives/opaque-objective`,
      campaignData,
    );
    expect(stack.map((frame) => frame.label)).toEqual([
      "GM Workspace",
      "Campaigns",
      "The Bells",
      "Plots",
      "Find the bell",
      "Objectives",
      "Reach the tower",
    ]);
    expect(stack.at(-1)?.links.map((link) => link.label)).toEqual([
      "Plot overview",
      "Objectives",
      "Pressures",
      "Resistances",
      "Discoveries",
      "Subplots",
      "Locations",
      "Prerequisites",
      "Dependencies",
    ]);
    expect(
      contextualNavigationStack(`${base}/objectives/new`, campaignData).at(-1)
        ?.label,
    ).toBe("New objective");
  });
  it("resolves captured Locations, placement associations, and nested claims", () => {
    expect(
      contextualNavigationStack(
        `${base}/locations/opaque-context`,
        campaignData,
      ).at(-1)?.label,
    ).toBe("Flooded harbor");
    expect(
      contextualNavigationStack(
        `${base}/locations/opaque-context/placements/opaque-placement`,
        campaignData,
      )
        .slice(-2)
        .map((frame) => frame.label),
    ).toEqual(["Placement associations", "Harbor keeper"]);
    expect(
      contextualNavigationStack(
        `${base}/discoveries/opaque-discovery/claims/opaque-claim`,
        campaignData,
      )
        .slice(-2)
        .map((frame) => frame.label),
    ).toEqual(["Claims", "The bell opens the gate"]);
  });
  it("uses neutral fallbacks for unavailable records and keeps list breadcrumbs", () => {
    for (const suffix of [
      "objectives/missing",
      "locations/missing",
      "dependencies/missing",
      "discoveries/missing/claims/missing",
    ])
      expect(
        contextualNavigationStack(`${base}/${suffix}`)
          .map((frame) => frame.label)
          .join(" "),
      ).not.toMatch(/opaque|missing/);
    expect(
      contextualNavigationStack(`${base}/dependencies`, campaignData).at(-1)
        ?.label,
    ).toBe("Dependencies");
  });
});
