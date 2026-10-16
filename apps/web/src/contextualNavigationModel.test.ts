import { describe, expect, it } from "vitest";
import {
  contextualBreadcrumbs,
  contextualNavigationStack,
  contextualSidebarFrame,
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
  it("reconstructs Location ancestry while keeping property groups out of the sidebar", () => {
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
    expect(stack.at(-1)?.links).toEqual([]);
    expect(contextualSidebarFrame(stack).label).toBe("Age of Wonders");
    expect(
      contextualBreadcrumbs(mapPath, stack).map((crumb) => crumb.label),
    ).toEqual(stack.map((frame) => frame.label));
  });
  it.each(["bestiary/creatures", "item-compendium/items", "characters/skills"])(
    "keeps the owning World navigation when opening a record in %s",
    (library) => {
      const stack = contextualNavigationStack(
        `/worlds/secret-world/${library}/secret-record`,
        data,
      );
      expect(contextualSidebarFrame(stack).kind).toBe("World");
      expect(stack.at(-1)?.href).toContain("secret-record");
    },
  );
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
    expect(stack.at(-1)?.links.find((link) => link.active)?.label).toBe(
      "Bestiary",
    );
  });
  it("keeps model facets in the same World context", () => {
    const stack = contextualNavigationStack(
      "/worlds/secret-world/characters/model/attributes/effective",
      data,
    );
    expect(stack.at(-1)?.kind).toBe("World");
    expect(stack.at(-1)?.links.find((link) => link.active)?.label).toBe(
      "Rules",
    );
    expect(stack.map(({ label }) => label)).toEqual([
      "GM Workspace",
      "Worlds",
      "Age of Wonders",
    ]);
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

describe("Item mechanics ancestry", () => {
  const base = "/worlds/secret-world/item-compendium/items/secret-item";
  const definition = (id: string, name: string, components = {}) => ({
    identity: { id, name },
    components,
  });
  const itemData = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "secret-item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Clockwork carriage" },
          components: {
            traits: [
              definition("secret-trait", "Hidden signal", {
                actions: [definition("signal/action", "Sound the bell")],
              }),
            ],
            actions: [definition("secret-action", "Wind spring")],
            vehicle: {
              actions: [definition("secret-drive", "Drive carriage")],
            },
          },
        },
      },
    ],
  };
  it.each([
    ["traits", ["Traits"]],
    ["traits/new", ["Traits", "New Trait"]],
    ["traits/secret-trait", ["Traits", "Hidden signal"]],
    ["traits/secret-trait/actions", ["Traits", "Hidden signal", "Actions"]],
    [
      "traits/secret-trait/actions/signal%2Faction",
      ["Traits", "Hidden signal", "Actions", "Sound the bell"],
    ],
    [
      "traits/secret-trait/actions/new",
      ["Traits", "Hidden signal", "Actions", "New Action"],
    ],
    ["actions/secret-action", ["Actions", "Wind spring"]],
    ["actions/new", ["Actions", "New Action"]],
    ["vehicle", ["Vehicle"]],
    ["vehicle/actions", ["Vehicle", "Actions"]],
    ["vehicle/actions/secret-drive", ["Vehicle", "Actions", "Drive carriage"]],
    ["vehicle/actions/new", ["Vehicle", "Actions", "New Action"]],
  ])(
    "reconstructs direct entry to %s and preserves World navigation",
    (suffix, expected) => {
      const pathname = `${base}/${suffix}`;
      const stack = contextualNavigationStack(pathname, itemData);
      expect(stack.map((frame) => frame.label)).toEqual([
        "GM Workspace",
        "Worlds",
        "Workshop",
        "Clockwork carriage",
        ...expected,
      ]);
      expect(
        contextualBreadcrumbs(pathname, stack).map((crumb) => crumb.label),
      ).toEqual(stack.map((frame) => frame.label));
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
    },
  );
  it("retains canonical encoded ancestor destinations", () => {
    const stack = contextualNavigationStack(
      `${base}/traits/secret-trait/actions/signal%2Faction`,
      itemData,
    );
    expect(stack.slice(-4).map((frame) => frame.href)).toEqual([
      `${base}/traits`,
      `${base}/traits/secret-trait`,
      `${base}/traits/secret-trait/actions`,
      `${base}/traits/secret-trait/actions/signal%2Faction`,
    ]);
  });
  it.each([
    "traits/secret-missing/actions/secret-missing",
    "actions/secret-missing",
    "vehicle/actions/secret-missing",
  ])("uses neutral labels for unavailable children in %s", (suffix) => {
    const stack = contextualNavigationStack(`${base}/${suffix}`, itemData);
    expect(stack.map((frame) => frame.label).join(" ")).not.toContain(
      "secret-",
    );
    expect(stack.at(-1)?.label).toBe("Action");
  });
});

describe("Item Action outcome ancestry", () => {
  const base = "/worlds/world/item-compendium/items/item";
  const action = {
    identity: { id: "action/secret", name: "Light the beacon" },
    components: {
      outcomes: [
        {
          id: "outcome/secret",
          effects: [{ kind: "narrative", text: "A beacon shines" }],
        },
      ],
    },
  };
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Beacon" },
          components: {
            actions: [action],
            traits: [
              {
                identity: { id: "trait", name: "Signal" },
                components: { actions: [action] },
              },
            ],
            vehicle: { actions: [action] },
          },
        },
      },
    ],
  };
  it.each(["actions", "traits/trait/actions", "vehicle/actions"])(
    "keeps named ancestry for %s outcomes and ordered effects",
    (prefix) => {
      const path = `${base}/${prefix}/action%2Fsecret/outcomes/outcome%2Fsecret/effects/0`;
      const stack = contextualNavigationStack(path, data);
      expect(stack.slice(-5).map((entry) => entry.label)).toEqual([
        "Light the beacon",
        "Outcomes",
        "Outcome 1",
        "Effects",
        "Effect 1",
      ]);
      expect(stack.at(-3)?.href).toBe(
        `${base}/${prefix}/action%2Fsecret/outcomes/outcome%2Fsecret`,
      );
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
      expect(
        contextualBreadcrumbs(path, stack)
          .map((entry) => entry.label)
          .join(" "),
      ).not.toContain("secret");
    },
  );
  it.each([
    ["outcomes/new", "New Outcome"],
    ["outcomes/missing/effects/new", "New Effect"],
    ["outcomes/missing/effects/99", "Effect"],
  ])("uses neutral names for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(
        `${base}/actions/action%2Fsecret/${suffix}`,
        data,
      ).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Item Action cost ancestry", () => {
  const base = "/worlds/world/item-compendium/items/item";
  const action = {
    identity: { id: "costs", name: "Sound the bell" },
    components: { costs: [{ kind: "economy", activation: "action" }] },
  };
  const data = {
    worldName: "Workshop",
    records: [
      {
        resourceType: "definitions",
        sourceId: "item",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            actions: [action],
            traits: [
              {
                identity: { id: "trait/secret", name: "Chime" },
                components: { actions: [action] },
              },
            ],
            vehicle: { actions: [action] },
          },
        },
      },
    ],
  };
  it.each(["actions", "traits/trait%2Fsecret/actions", "vehicle/actions"])(
    "resolves cost ancestors under %s",
    (prefix) => {
      const path = `${base}/${prefix}/costs/costs/0`;
      const stack = contextualNavigationStack(path, data);
      expect(stack.slice(-3).map((entry) => entry.label)).toEqual([
        "Sound the bell",
        "Costs",
        "Cost 1",
      ]);
      expect(stack.at(-2)?.href).toBe(`${base}/${prefix}/costs/costs`);
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
      expect(
        contextualBreadcrumbs(path, stack)
          .map((entry) => entry.label)
          .join(" "),
      ).not.toContain("secret");
    },
  );
  it.each([
    ["new", "New Cost"],
    ["99", "Cost"],
    ["opaque-id", "Cost"],
  ])("uses a safe label for %s", (id, label) => {
    expect(
      contextualNavigationStack(`${base}/actions/costs/costs/${id}`, data).at(
        -1,
      )?.label,
    ).toBe(label);
  });
});

describe("Item Action choice ancestry", () => {
  const base = "/worlds/world/item-compendium/items/item";
  const action = {
    identity: { id: "choices", name: "Ring the bell" },
    components: {
      choices: [
        {
          id: "choice/secret",
          prompt: "Choose a tone",
          options: [{ id: "options", label: "Deep tone", value: "deep" }],
        },
      ],
    },
  };
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            actions: [action],
            traits: [
              {
                identity: { id: "trait/secret", name: "Chime" },
                components: { actions: [action] },
              },
            ],
            vehicle: { actions: [action] },
          },
        },
      },
    ],
  };
  it.each(["actions", "traits/trait%2Fsecret/actions", "vehicle/actions"])(
    "resolves choice and option ancestry under %s",
    (prefix) => {
      const path = `${base}/${prefix}/choices/choices/choice%2Fsecret/options/options`;
      const stack = contextualNavigationStack(path, data);
      expect(stack.slice(-5).map((frame) => frame.label)).toEqual([
        "Ring the bell",
        "Choices",
        "Choose a tone",
        "Options",
        "Deep tone",
      ]);
      expect(stack.at(-3)?.href).toBe(
        `${base}/${prefix}/choices/choices/choice%2Fsecret`,
      );
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
      expect(
        contextualBreadcrumbs(path, stack)
          .map((frame) => frame.label)
          .join(" "),
      ).not.toContain("secret");
    },
  );
  it.each([
    ["new", "New Choice"],
    ["missing-secret", "Choice"],
    ["choice%2Fsecret/options/new", "New Option"],
    ["missing-secret/options/missing-secret", "Option"],
  ])("uses safe labels for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(
        `${base}/actions/choices/choices/${suffix}`,
        data,
      ).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Item Action prerequisite ancestry", () => {
  const base = "/worlds/world/item-compendium/items/item";
  const action = {
    identity: { id: "prerequisites", name: "Sound the bell" },
    components: {
      prerequisites: [{ kind: "has-tag", subject: "actor", tag: "ready" }],
    },
  };
  const data = {
    worldName: "Workshop",
    records: [
      {
        resourceType: "definitions",
        sourceId: "item",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            actions: [action],
            traits: [
              {
                identity: { id: "trait/secret", name: "Chime" },
                components: { actions: [action] },
              },
            ],
            vehicle: { actions: [action] },
          },
        },
      },
    ],
  };
  it.each(["actions", "traits/trait%2Fsecret/actions", "vehicle/actions"])(
    "resolves prerequisite ancestors under %s",
    (prefix) => {
      const path = `${base}/${prefix}/prerequisites/prerequisites/0`;
      const stack = contextualNavigationStack(path, data);
      expect(stack.slice(-3).map((entry) => entry.label)).toEqual([
        "Sound the bell",
        "Prerequisites",
        "Prerequisite 1",
      ]);
      expect(stack.at(-2)?.href).toBe(
        `${base}/${prefix}/prerequisites/prerequisites`,
      );
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
      expect(
        contextualBreadcrumbs(path, stack)
          .map((entry) => entry.label)
          .join(" "),
      ).not.toContain("secret");
    },
  );
  it.each([
    ["new", "New Prerequisite"],
    ["99", "Prerequisite"],
    ["opaque-id", "Prerequisite"],
  ])("uses a safe label for %s", (id, label) => {
    expect(
      contextualNavigationStack(
        `${base}/actions/prerequisites/prerequisites/${id}`,
        data,
      ).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Compound prerequisite ancestry", () => {
  const base = "/worlds/world/item-compendium/items/item";
  const action = {
    identity: { id: "children", name: "Ring bell" },
    components: {
      prerequisites: [
        {
          kind: "all",
          predicates: [
            {
              kind: "not",
              predicate: { kind: "any", predicates: [{ kind: "always" }] },
            },
          ],
        },
      ],
    },
  };
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            actions: [action],
            traits: [
              {
                identity: { id: "trait/secret", name: "Signal" },
                components: { actions: [action] },
              },
            ],
            vehicle: { actions: [action] },
          },
        },
      },
    ],
  };
  it.each(["actions", "traits/trait%2Fsecret/actions", "vehicle/actions"])(
    "resolves all/not/any descendants under %s",
    (prefix) => {
      const path = `${base}/${prefix}/children/prerequisites/0/children/0/children/0/children/0`;
      const stack = contextualNavigationStack(path, data);
      expect(stack.slice(-9).map((frame) => frame.label)).toEqual([
        "Ring bell",
        "Prerequisites",
        "Prerequisite 1",
        "Nested prerequisites",
        "Prerequisite 1",
        "Nested prerequisites",
        "Prerequisite 1",
        "Nested prerequisites",
        "Prerequisite 1",
      ]);
      expect(stack.at(-2)?.href).toBe(path.slice(0, -2));
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
      expect(
        contextualBreadcrumbs(path, stack)
          .map((frame) => frame.label)
          .join(" "),
      ).not.toContain("secret");
    },
  );
  it.each([
    ["0/children/new", "New Prerequisite"],
    ["0/children/99/children/opaque-secret", "Prerequisite"],
    ["0/children/0/children/1", "Prerequisite"],
  ])("keeps missing/new descendant labels neutral %s", (suffix, label) => {
    expect(
      contextualNavigationStack(
        `${base}/actions/children/prerequisites/${suffix}`,
        data,
      ).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Choice Option prerequisite ancestry", () => {
  const base = "/worlds/world/item-compendium/items/item";
  const action = {
    identity: { id: "prerequisites", name: "Sound bell" },
    components: {
      choices: [
        {
          id: "choice/secret",
          prompt: "Choose tone",
          options: [
            {
              id: "prerequisites",
              label: "Deep tone",
              value: { preserved: true },
              prerequisites: [{ kind: "not", predicate: { kind: "always" } }],
            },
          ],
        },
      ],
    },
  };
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            actions: [action],
            traits: [
              {
                identity: { id: "trait/secret", name: "Signal" },
                components: { actions: [action] },
              },
            ],
            vehicle: { actions: [action] },
          },
        },
      },
    ],
  };
  it.each(["actions", "traits/trait%2Fsecret/actions", "vehicle/actions"])(
    "resolves full owned ancestry under %s",
    (prefix) => {
      const path = `${base}/${prefix}/prerequisites/choices/choice%2Fsecret/options/prerequisites/prerequisites/0/children/0`;
      const stack = contextualNavigationStack(path, data);
      expect(stack.slice(-9).map((frame) => frame.label)).toEqual([
        "Sound bell",
        "Choices",
        "Choose tone",
        "Options",
        "Deep tone",
        "Prerequisites",
        "Prerequisite 1",
        "Nested prerequisites",
        "Prerequisite 1",
      ]);
      expect(stack.at(-5)?.href).toBe(
        `${base}/${prefix}/prerequisites/choices/choice%2Fsecret/options/prerequisites`,
      );
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
      expect(
        contextualBreadcrumbs(path, stack)
          .map((frame) => frame.label)
          .join(" "),
      ).not.toContain("secret");
    },
  );
  it.each([
    ["prerequisites/new", "New Prerequisite"],
    ["prerequisites/99", "Prerequisite"],
    ["missing-secret/prerequisites/0", "Prerequisite"],
  ])("uses neutral missing/new labels for %s", (suffix, label) => {
    const path = `${base}/actions/prerequisites/choices/choice%2Fsecret/options/${suffix.startsWith("missing") ? "" : "prerequisites/"}${suffix}`;
    expect(contextualNavigationStack(path, data).at(-1)?.label).toBe(label);
  });
});

describe("Trait prerequisite ancestry", () => {
  const base = "/worlds/world/item-compendium/items/item";
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            traits: [
              {
                identity: { id: "prerequisites/secret", name: "Chime" },
                components: {
                  prerequisites: [
                    {
                      kind: "all",
                      predicates: [
                        { kind: "not", predicate: { kind: "always" } },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  };
  it("retains Trait ownership through nested groups", () => {
    const path = `${base}/traits/prerequisites%2Fsecret/prerequisites/0/children/0/children/0`;
    const stack = contextualNavigationStack(path, data);
    expect(stack.slice(-7).map((frame) => frame.label)).toEqual([
      "Chime",
      "Prerequisites",
      "Prerequisite 1",
      "Nested prerequisites",
      "Prerequisite 1",
      "Nested prerequisites",
      "Prerequisite 1",
    ]);
    expect(stack.at(-7)?.href).toBe(`${base}/traits/prerequisites%2Fsecret`);
    expect(contextualSidebarFrame(stack).label).toBe("Workshop");
    expect(
      contextualBreadcrumbs(path, stack)
        .map((frame) => frame.label)
        .join(" "),
    ).not.toContain("secret");
  });
  it.each([
    ["prerequisites%2Fsecret/prerequisites/new", "New Prerequisite"],
    ["missing-secret/prerequisites/0", "Prerequisite"],
    ["prerequisites%2Fsecret/prerequisites/0/children/99", "Prerequisite"],
  ])("keeps neutral labels for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(`${base}/traits/${suffix}`, data).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Trait Choice ancestry", () => {
  const base =
    "/worlds/world/item-compendium/items/item/traits/choices%2Fsecret";
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            traits: [
              {
                identity: { id: "choices/secret", name: "Chime" },
                components: {
                  choices: [
                    {
                      id: "options/secret",
                      prompt: "Choose tone",
                      options: [
                        {
                          id: "prerequisites",
                          label: "Deep tone",
                          prerequisites: [
                            { kind: "not", predicate: { kind: "always" } },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  };
  it("preserves named Trait, Choice and Option ancestry into nested prerequisites", () => {
    const path = `${base}/choices/options%2Fsecret/options/prerequisites/prerequisites/0/children/0`;
    const stack = contextualNavigationStack(path, data);
    expect(stack.slice(-9).map((frame) => frame.label)).toEqual([
      "Chime",
      "Choices",
      "Choose tone",
      "Options",
      "Deep tone",
      "Prerequisites",
      "Prerequisite 1",
      "Nested prerequisites",
      "Prerequisite 1",
    ]);
    expect(stack.at(-9)?.href).toBe(base);
    expect(contextualSidebarFrame(stack).label).toBe("Workshop");
  });
  it.each([
    ["choices/new", "New Choice"],
    ["choices/options%2Fsecret/options/new", "New Option"],
    ["choices/missing/options/missing", "Option"],
  ])("uses neutral labels for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(`${base}/${suffix}`, data).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Trait modifier ancestry", () => {
  const base =
    "/worlds/world/item-compendium/items/item/traits/modifiers%2Fsecret/modifiers";
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            traits: [
              {
                identity: { id: "modifiers/secret", name: "Chime" },
                components: {
                  modifiers: [
                    { id: "first", target: "actor.speed", operation: "add" },
                    {
                      id: "modifiers/secret",
                      sourceLabel: "opaque-secret",
                      operation: "set",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  };
  it("shows named Trait and ordinal modifier without opaque identities", () => {
    const stack = contextualNavigationStack(`${base}/modifiers%2Fsecret`, data);
    expect(stack.slice(-3).map((frame) => frame.label)).toEqual([
      "Chime",
      "Modifiers",
      "Modifier 2",
    ]);
    expect(stack.at(-1)?.href).toBe(`${base}/modifiers%2Fsecret`);
    expect(contextualSidebarFrame(stack).label).toBe("Workshop");
  });
  it.each([
    ["new", "New Modifier"],
    ["missing-secret", "Modifier"],
  ])("uses neutral label for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(`${base}/${suffix}`, data).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Trait modifier predicate ancestry", () => {
  const base =
    "/worlds/world/item-compendium/items/item/traits/modifiers%2Fsecret/modifiers/predicate%2Fsecret";
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            traits: [
              {
                identity: { id: "modifiers/secret", name: "Chime" },
                components: {
                  modifiers: [
                    {
                      id: "predicate/secret",
                      predicate: {
                        kind: "all",
                        predicates: [
                          { kind: "not", predicate: { kind: "always" } },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  };
  it("retains modifier ownership through nested predicates", () => {
    const stack = contextualNavigationStack(
      `${base}/predicate/0/children/0/children/0`,
      data,
    );
    expect(stack.slice(-7).map((frame) => frame.label)).toEqual([
      "Modifier 1",
      "Predicate",
      "Predicate",
      "Nested prerequisites",
      "Prerequisite 1",
      "Nested prerequisites",
      "Prerequisite 1",
    ]);
    expect(stack.find((frame) => frame.label === "Modifier 1")?.href).toBe(
      base,
    );
    expect(contextualSidebarFrame(stack).label).toBe("Workshop");
  });
  it.each([
    ["predicate/new", "New Predicate"],
    ["predicate/4", "Predicate"],
    ["predicate/0/children/new", "New Prerequisite"],
  ])("uses neutral labels for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(`${base}/${suffix}`, data).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Trait grant ancestry", () => {
  const base =
    "/worlds/world/item-compendium/items/item/traits/grants%2Fsecret/grants";
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            traits: [
              {
                identity: { id: "grants/secret", name: "Chime" },
                components: {
                  grants: ["opaque-reference", "missing-reference"],
                },
              },
            ],
          },
        },
      },
    ],
  };
  it("retains named Trait and safe ordinal reference ancestry", () => {
    const stack = contextualNavigationStack(`${base}/1`, data);
    expect(stack.slice(-3).map((frame) => frame.label)).toEqual([
      "Chime",
      "Grants",
      "Grant 2",
    ]);
    expect(stack.at(-1)?.href).toBe(`${base}/1`);
    expect(contextualSidebarFrame(stack).label).toBe("Workshop");
  });
  it.each([
    ["new", "New Grant"],
    ["99", "Grant"],
    ["opaque-secret", "Grant"],
  ])("uses neutral label for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(`${base}/${suffix}`, data).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Trait trigger ancestry", () => {
  const base =
    "/worlds/world/item-compendium/items/item/traits/triggers%2Fsecret/triggers";
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            traits: [
              {
                identity: { id: "triggers/secret", name: "Chime" },
                components: {
                  triggers: [
                    {
                      event: "custom",
                      customEvent: "secret:event",
                      effects: [{ kind: "narrative", text: "Ring" }],
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  };
  it("retains Trait and trigger ancestry through nested effects", () => {
    const stack = contextualNavigationStack(`${base}/0/effects/0`, data);
    expect(stack.slice(-5).map((frame) => frame.label)).toEqual([
      "Chime",
      "Triggers",
      "Trigger 1",
      "Effects",
      "Effect 1",
    ]);
    expect(stack.at(-3)?.href).toBe(`${base}/0`);
    expect(contextualSidebarFrame(stack).label).toBe("Workshop");
  });
  it.each([
    ["new", "New Trigger"],
    ["99", "Trigger"],
    ["0/effects/new", "New Effect"],
    ["0/effects/99", "Effect"],
  ])("uses neutral labels for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(`${base}/${suffix}`, data).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Trigger predicate ancestry", () => {
  const base =
    "/worlds/world/item-compendium/items/item/traits/triggers%2Fsecret/triggers/0";
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            traits: [
              {
                identity: { id: "triggers/secret", name: "Chime" },
                components: {
                  triggers: [
                    {
                      event: "hit",
                      effects: [],
                      predicate: {
                        kind: "all",
                        predicates: [
                          { kind: "not", predicate: { kind: "always" } },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  };
  it("retains Trigger context through nested predicate groups", () => {
    const stack = contextualNavigationStack(
      `${base}/predicate/0/children/0/children/0`,
      data,
    );
    expect(stack.slice(-7).map((frame) => frame.label)).toEqual([
      "Trigger 1",
      "Predicate",
      "Predicate",
      "Nested prerequisites",
      "Prerequisite 1",
      "Nested prerequisites",
      "Prerequisite 1",
    ]);
    expect(stack.at(-7)?.href).toBe(base);
    expect(contextualSidebarFrame(stack).label).toBe("Workshop");
  });
  it.each([
    ["predicate/new", "New Predicate"],
    ["predicate/4", "Predicate"],
    ["predicate/0/children/new", "New Prerequisite"],
  ])("uses neutral labels for %s", (suffix, label) => {
    expect(
      contextualNavigationStack(`${base}/${suffix}`, data).at(-1)?.label,
    ).toBe(label);
  });
});

describe("Outcome predicate ancestry", () => {
  const action = {
    identity: { id: "action/secret", name: "Strike" },
    components: {
      outcomes: [
        {
          id: "outcome/secret",
          when: {
            kind: "all",
            predicates: [{ kind: "not", predicate: { kind: "always" } }],
          },
        },
      ],
    },
  };
  const data = {
    worldName: "Workshop",
    records: [
      {
        sourceId: "item",
        resourceType: "definitions",
        payload: {
          kind: "item",
          identity: { name: "Bell" },
          components: {
            actions: [action],
            traits: [
              {
                identity: { id: "t", name: "Chime" },
                components: { actions: [action] },
              },
            ],
            vehicle: { actions: [action] },
          },
        },
      },
    ],
  };
  it.each(["actions", "traits/t/actions", "vehicle/actions"])(
    "retains %s ownership through nested predicate",
    (prefix) => {
      const base = `/worlds/world/item-compendium/items/item/${prefix}/action%2Fsecret/outcomes/outcome%2Fsecret`;
      const stack = contextualNavigationStack(
        `${base}/predicate/0/children/0/children/0`,
        data,
      );
      expect(stack.slice(-7).map((frame) => frame.label)).toEqual([
        "Outcome 1",
        "Predicate",
        "Predicate",
        "Nested prerequisites",
        "Prerequisite 1",
        "Nested prerequisites",
        "Prerequisite 1",
      ]);
      expect(stack.find((frame) => frame.label === "Outcome 1")?.href).toBe(
        base,
      );
      expect(stack.some((frame) => frame.label === "Strike")).toBe(true);
      expect(stack.map((frame) => frame.label).join(" ")).not.toContain(
        "secret",
      );
      expect(contextualSidebarFrame(stack).label).toBe("Workshop");
    },
  );
  it.each([
    ["new", "New Predicate"],
    ["4", "Predicate"],
    ["0/children/new", "New Prerequisite"],
  ])("uses neutral predicate labels %s", (suffix, label) => {
    expect(
      contextualNavigationStack(
        `/worlds/world/item-compendium/items/item/actions/action%2Fsecret/outcomes/outcome%2Fsecret/predicate/${suffix}`,
        data,
      ).at(-1)?.label,
    ).toBe(label);
  });
});

describe("shared nested rule navigation", () => {
  const action = {
    identity: { id: "a/id", name: "Strike" },
    components: {
      outcomes: [
        {
          id: "o",
          effects: [
            { kind: "branch", whenTrue: [{ kind: "narrative", text: "Keep" }] },
          ],
        },
      ],
      targets: [
        {
          kind: "creature",
          filters: [{ kind: "not", predicate: { kind: "always" } }],
        },
      ],
    },
  };
  const record = {
    sourceId: "item",
    resourceType: "definitions",
    payload: {
      kind: "item",
      identity: { name: "Blade" },
      components: {
        actions: [action],
        traits: [
          {
            identity: { id: "t", name: "Power" },
            components: { actions: [action] },
          },
        ],
        vehicle: { actions: [action] },
      },
    },
  };
  it.each([
    "actions/a%2Fid",
    "traits/t/actions/a%2Fid",
    "vehicle/actions/a%2Fid",
  ])("retains owner ancestry and safe nested labels at %s", (owner) => {
    const stack = contextualNavigationStack(
      `/worlds/w/item-compendium/items/item/${owner}/rule/outcomes/0/effects/0/whenTrue/0`,
      { worldName: "World", records: [record] },
    );
    expect(stack.map((f) => f.label)).toContain("Strike");
    expect(stack.slice(-6).map((f) => f.label)).toEqual([
      "Outcomes",
      "Outcome 1",
      "Effects",
      "Effect 1",
      "When true",
      "Effect 1",
    ]);
    expect(stack.map((f) => f.label).join(" ")).not.toMatch(/a\/id|a%2Fid/);
    for (const frame of stack)
      expect(
        contextualNavigationStack(frame.href, {
          worldName: "World",
          records: [record],
        }).at(-1)?.label,
      ).toBe(frame.label);
  });
});

describe("B02 authoring ancestry", () => {
  it("reconstructs catalog actor nested rules without showing identifiers", () => {
    const payload = {
      kind: "monster",
      identity: { name: "Owl" },
      components: {
        bonusActions: [
          {
            identity: { id: "secret-action", name: "Dive" },
            components: { outcomes: [] },
          },
        ],
      },
    };
    const stack = contextualNavigationStack(
      "/worlds/w/bestiary/catalog-monsters/secret-owner/rule/bonusActions/0/components/outcomes",
      {
        worldName: "World",
        records: [
          { sourceId: "secret-owner", resourceType: "definitions", payload },
        ],
      },
    );
    expect(stack.map((v) => v.label)).toContain("Catalog creatures");
    expect(stack.map((v) => v.label)).toContain("Owl");
    expect(stack.at(-1)?.label).toBe("Outcomes");
    expect(stack.some((v) => v.label.includes("secret"))).toBe(false);
  });
  it("reconstructs Item crafting collection ancestry", () => {
    const stack = contextualNavigationStack(
      "/worlds/w/item-compendium/items/item/owner/crafting/ingredients/0",
      {
        records: [
          {
            sourceId: "item",
            resourceType: "definitions",
            payload: {
              kind: "item",
              identity: { name: "Sword" },
              components: {
                crafting: { ingredients: [{ tag: "metal", quantity: 1 }] },
              },
            },
          },
        ],
      },
    );
    expect(stack.map((v) => v.label)).toContain("Item rules");
    expect(stack.at(-1)?.label.toLowerCase()).toContain("ingredient");
  });
});
