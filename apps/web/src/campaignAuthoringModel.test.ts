import { describe, expect, it } from "vitest";
import type { JsonValue } from "./api";
import {
  campaignDefinitionNavigationForPath,
  campaignDraftWithRecord,
  campaignDraftWithoutRecord,
  campaignPlacementSourceId,
  campaignPlotTree,
  campaignPlotParentCandidates,
  campaignProposalRecoveryRequested,
  campaignProposalRecoverySuffix,
  campaignRecordLabel,
  humanReferenceLabel,
  mergeDiscoveryLines,
  mergeCampaignPlacementPayload,
  mergeNamedComponentLines,
  mergePlotLocationContexts,
  mergePlotRelationships,
  plotBreadcrumb,
  plotDescendantIds,
  reviewedRangesCoverTotal,
  type CampaignDraftRecord,
} from "./campaignAuthoringModel";

describe("Campaign proposal recovery", () => {
  it("preserves tutorial context and recognizes only its explicit notice", () => {
    const suffix = campaignProposalRecoverySuffix("?quickStart=campaign-plots");
    expect(suffix).toContain("quickStart=campaign-plots");
    expect(campaignProposalRecoveryRequested(suffix)).toBe(true);
    expect(campaignProposalRecoveryRequested("?creationNotice=other")).toBe(
      false,
    );
  });
});

describe("migration page review coverage", () => {
  it("requires contiguous visible pages and never credits an unseen gap", () => {
    expect(
      reviewedRangesCoverTotal(
        [
          { start: 0, end: 0 },
          { start: 150, end: 200 },
        ],
        200,
      ),
    ).toBe(false);
    expect(
      reviewedRangesCoverTotal(
        [
          { start: 50, end: 100 },
          { start: 0, end: 50 },
        ],
        100,
      ),
    ).toBe(true);
  });
});

const plot = (
  id: string,
  name: string,
  parentPlotDefinitionId?: string,
): CampaignDraftRecord => ({
  resourceType: "plots",
  sourceId: id,
  payload: {
    id,
    kind: "plot",
    name,
    parent: parentPlotDefinitionId
      ? { kind: "subplot", parentPlotDefinitionId }
      : { kind: "root" },
    objectives: [],
    pressures: [],
    resistances: [],
    discoveries: [],
    locationContexts: [],
  },
});

describe("human-facing references", () => {
  it("replaces opaque identifiers with a neutral label", () => {
    expect(
      humanReferenceLabel(
        "plot:2bf0c7b1-4078-46ec-a134-cf83b6ec751e",
        "Affected Plot",
      ),
    ).toBe("Affected Plot");
    expect(humanReferenceLabel("The Flooded Archive", "Affected Plot")).toBe(
      "The Flooded Archive",
    );
  });
});

describe("Campaign Definition navigation", () => {
  it("exposes discrete authoring groups and selects nested routes", () => {
    const groups = campaignDefinitionNavigationForPath(
      "campaign-opaque",
      "/campaigns/definitions/campaign-opaque/plots/plot-opaque",
    );
    expect(groups.map(({ label }) => label)).toEqual([
      "Story",
      "World context",
      "Lifecycle",
    ]);
    expect(groups.find(({ active }) => active)?.label).toBe("Story");
    expect(
      JSON.stringify(
        groups.map(({ label, children }) => ({
          label,
          children: children.map((child) => child.label),
        })),
      ),
    ).not.toContain("campaign-opaque");
  });
});

describe("Campaign Plot hierarchy", () => {
  const records = [
    plot("root-a", "Vanishing Bells"),
    plot("child-a", "The Flooded Archive", "root-a"),
    plot("grandchild-a", "A Witness Remembers", "child-a"),
    plot("root-b", "The Broken Alliance"),
  ];

  it("preserves multiple roots and recursively nested subplots", () => {
    const tree = campaignPlotTree(records);
    expect(tree.map(({ name }) => name)).toEqual([
      "The Broken Alliance",
      "Vanishing Bells",
    ]);
    expect(tree[1]?.children[0]?.children[0]?.name).toBe("A Witness Remembers");
  });

  it("builds human-readable ancestry without exposing identifiers", () => {
    expect(plotBreadcrumb(records, "grandchild-a")).toEqual([
      "Vanishing Bells",
      "The Flooded Archive",
      "A Witness Remembers",
    ]);
  });

  it("identifies descendants that cannot become a Plot parent", () => {
    expect([...plotDescendantIds(records, "root-a")].sort()).toEqual([
      "child-a",
      "grandchild-a",
    ]);
  });

  it("offers every same-Campaign non-descendant Plot as a parent", () => {
    expect(
      campaignPlotParentCandidates(records, "root-a").map(campaignRecordLabel),
    ).toEqual(["The Broken Alliance"]);
    expect(
      campaignPlotParentCandidates(records, "child-a").map(campaignRecordLabel),
    ).toEqual(["The Broken Alliance", "Vanishing Bells"]);
  });

  it("replaces one draft record without disturbing other authored content", () => {
    const replacement = plot("child-a", "The Dry Archive", "root-a");
    const next = campaignDraftWithRecord(records, replacement);
    expect(next).toHaveLength(records.length);
    expect(campaignRecordLabel(next[1]!)).toBe("The Dry Archive");
    expect(campaignRecordLabel(next[0]!)).toBe("Vanishing Bells");
  });

  it("removes one draft record without disturbing other authored content", () => {
    const next = campaignDraftWithoutRecord(records, "plots", "child-a");
    expect(next.map(({ sourceId }) => sourceId)).toEqual([
      "root-a",
      "grandchild-a",
      "root-b",
    ]);
  });
});

describe("Campaign placements", () => {
  it("resolves independent source identifiers from the source union", () => {
    expect(
      campaignPlacementSourceId({
        resourceType: "campaign-placements",
        sourceId: "placement-a",
        payload: {
          kind: "independent",
          source: { kind: "world-creature", creatureId: "creature-a" },
        },
      }),
    ).toBe("creature-a");
    expect(
      campaignPlacementSourceId({
        resourceType: "campaign-placements",
        sourceId: "placement-b",
        payload: {
          kind: "independent",
          source: { kind: "world-item", itemDefinitionId: "item-a" },
        },
      }),
    ).toBe("item-a");
  });

  it("preserves rich supported placement data while editing a label", () => {
    const record = {
      resourceType: "campaign-placements",
      sourceId: "placement-rich",
      payload: {
        id: "placement-rich",
        kind: "independent",
        name: "Before",
        locationId: "harbor",
        plotDefinitionIds: [],
        source: {
          kind: "world-creature",
          creatureId: "dragon",
          "pack:variant": "elder",
        },
        mapPosition: { kind: "normalized-map", x: 0.25, y: 0.75 },
        scale: 1.5,
        notes: "Hidden below deck",
        extensions: { "pack:initiative": 3 },
      },
    } satisfies CampaignDraftRecord;
    expect(
      mergeCampaignPlacementPayload(record, "independent", { name: "After" }),
    ).toEqual({ ...record.payload, name: "After" });
  });
});

describe("rich Plot editing", () => {
  it("preserves untouched imported structure while simple fields round-trip", () => {
    const objective: JsonValue = {
      id: "objective-a",
      name: "Open the gate",
      description: "Before dawn",
      extensions: { "pack:rank": 2 },
    };
    const discovery: JsonValue = {
      id: "discovery-a",
      name: "Broken seal",
      extensions: { "pack:visibility": "gm" },
      claims: [
        {
          id: "claim-a",
          kind: "rumor",
          statement: "The seal sang",
          provenance: "Witness",
          relatedTruthClaimId: "claim-b",
          conflictsWithClaimIds: ["claim-c"],
          extensions: { "pack:tone": "ominous" },
        },
        { id: "claim-b", kind: "truth", statement: "The seal was cut" },
      ],
    };
    const context: JsonValue = {
      id: "context-a",
      locationId: "harbor",
      placementDefinitionIds: ["placement-a"],
      actorPlacements: [{ id: "legacy-actor" }],
      extensions: { "pack:weather": "rain" },
    };
    const relationship: JsonValue = {
      plotDefinitionId: "root",
      crossBranchRationale: "Shared witness",
      extensions: { "pack:weight": 4 },
    };
    expect(
      mergeNamedComponentLines("Open the gate", [objective], "objective")[0],
    ).toEqual(objective);
    expect(
      mergeDiscoveryLines("rumor | Broken seal | The seal sang", [
        discovery,
      ])[0],
    ).toEqual(discovery);
    expect(mergePlotLocationContexts(["harbor"], [context])[0]).toEqual(
      context,
    );
    expect(
      mergePlotRelationships(["root"], [relationship], {
        root: "Shared witness",
      })[0],
    ).toEqual(relationship);
  });

  it("preserves stable imported identity and metadata when a line is renamed", () => {
    const objective: JsonValue = {
      id: "objective-a",
      name: "Open the gate",
      description: "Before dawn",
      extensions: { "pack:rank": 2 },
    };
    const discovery: JsonValue = {
      id: "discovery-a",
      name: "Broken seal",
      claims: [
        {
          id: "claim-a",
          kind: "rumor",
          statement: "The seal sang",
          provenance: "Witness",
          conflictsWithClaimIds: ["claim-c"],
        },
        { id: "claim-b", kind: "truth", statement: "The seal was cut" },
      ],
      extensions: { "pack:visibility": "gm" },
    };
    expect(
      mergeNamedComponentLines(
        "Open the eastern gate",
        [objective],
        "objective",
      )[0],
    ).toEqual({ ...objective, name: "Open the eastern gate" });
    expect(
      mergeDiscoveryLines("belief | Repaired seal | The seal now holds", [
        discovery,
      ])[0],
    ).toEqual({
      ...discovery,
      name: "Repaired seal",
      claims: [
        {
          id: "claim-a",
          provenance: "Witness",
          conflictsWithClaimIds: ["claim-c"],
          kind: "belief",
          statement: "The seal now holds",
        },
        { id: "claim-b", kind: "truth", statement: "The seal was cut" },
      ],
    });
  });

  it("retains an imported invalid empty Discovery for explicit validation instead of deleting it", () => {
    const invalid: JsonValue = {
      id: "discovery-empty",
      name: "Unresolved lead",
      claims: [],
      extensions: { "import:warning": "missing claim" },
    };
    expect(mergeDiscoveryLines("", [invalid])).toEqual([invalid]);
  });
});
