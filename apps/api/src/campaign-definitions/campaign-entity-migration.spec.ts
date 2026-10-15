import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { validateCampaignDefinitionDraft } from "./campaign-definition-draft-validator";

const world = buildSnapshotManifest(1, [
  {
    resourceType: "locations",
    sourceId: "harbor",
    payload: { name: "Harbor" },
  },
  {
    resourceType: "definitions",
    sourceId: "keeper",
    payload: { kind: "creature" },
  },
  {
    resourceType: "world-placements",
    sourceId: "original",
    payload: {
      id: "original",
      locationId: "harbor",
      source: { kind: "world-creature", creatureId: "keeper" },
    },
  },
]);
function plot(id = "plot", overrides: Record<string, unknown> = {}) {
  return {
    id,
    campaignDefinitionId: "campaign",
    name: "The arrival",
    parent: { kind: "root" },
    objectives: [],
    pressures: [],
    resistances: [],
    discoveries: [],
    locationContexts: [],
    ...overrides,
  };
}
function report(
  plots: ReturnType<typeof plot>[],
  placements: Record<string, unknown>[] = [],
) {
  return validateCampaignDefinitionDraft(
    "campaign",
    {
      formatVersion: 1,
      gmPremise: "",
      playerIntroduction: "",
      modelSchemaReleaseIds: [],
      plotDefinitionIds: plots.map((p) => p.id),
      placementDefinitionIds: placements.map((p) => p.id),
    },
    [
      ...plots.map((payload) => ({
        resourceType: "plots",
        sourceId: payload.id,
        payload,
      })),
      ...placements.map((payload) => ({
        resourceType: "campaign-placements",
        sourceId: String(payload.id),
        payload,
      })),
    ],
    world,
  );
}

describe("Campaign authoring entity integration", () => {
  it("resolves legacy Claim links across Discoveries in the same Plot without rewriting captures", () => {
    const payload = plot("plot", {
      extensions: { private: { note: "GM only" } },
      discoveries: [
        {
          id: "first",
          name: "Facts",
          claims: [
            { id: "truth", kind: "truth", statement: "The keeper left." },
          ],
        },
        {
          id: "second",
          name: "Stories",
          claims: [
            {
              id: "rumor",
              kind: "rumor",
              statement: "The keeper fled.",
              relatedTruthClaimId: "truth",
              conflictsWithClaimIds: ["truth"],
            },
          ],
        },
      ],
    });
    const before = JSON.stringify(payload);
    expect(report([payload])).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(payload)).toBe(before);
  });

  it("isolates Claim scope between Plots", () => {
    const first = plot("first", {
      discoveries: [
        {
          id: "fact",
          name: "Fact",
          claims: [{ id: "truth", kind: "truth", statement: "True." }],
        },
      ],
    });
    const second = plot("second", {
      name: "Other Plot",
      discoveries: [
        {
          id: "story",
          name: "Story",
          claims: [
            {
              id: "rumor",
              kind: "rumor",
              statement: "Maybe.",
              relatedTruthClaimId: "truth",
            },
          ],
        },
      ],
    });
    expect(report([first, second]).issues).toEqual([
      {
        code: "claim-related-truth-not-found",
        subject: "Other Plot",
        detail: "A Rumor's related Truth is not present in this Plot.",
      },
    ]);
  });

  it("reports reciprocal Plot/Placement context mismatches through entity validity", () => {
    const placement = {
      id: "placement",
      kind: "independent",
      locationId: "harbor",
      plotDefinitionIds: [],
      source: { kind: "world-creature", creatureId: "keeper" },
    };
    const payload = plot("plot", {
      locationContexts: [
        {
          id: "context",
          locationId: "harbor",
          placementDefinitionIds: ["placement"],
        },
      ],
    });
    expect(report([payload], [placement]).issues).toEqual([
      {
        code: "plot-context-placement-mismatch",
        subject: "The arrival",
        detail:
          "A Plot Location context and its Campaign placement must reference one another at the same captured Location.",
      },
    ]);
  });

  it("retains exact hierarchy cycle diagnostics", () => {
    const first = plot("first", {
      name: "First",
      parent: { kind: "subplot", parentPlotDefinitionId: "second" },
    });
    const second = plot("second", {
      name: "Second",
      parent: { kind: "subplot", parentPlotDefinitionId: "first" },
    });
    expect(report([first, second]).issues).toEqual([
      {
        code: "plot-parent-cycle",
        subject: "Second",
        detail: "The Plot parent hierarchy contains a cycle.",
      },
    ]);
  });

  it("preserves separate graph diagnostics for same-named Plots", () => {
    const first = plot("first", {
      parent: { kind: "subplot", parentPlotDefinitionId: "missing-first" },
    });
    const second = plot("second", {
      parent: { kind: "subplot", parentPlotDefinitionId: "missing-second" },
    });
    const issue = {
      code: "plot-parent-not-found",
      subject: "The arrival",
      detail: "The subplot's parent Plot is not present.",
    };
    expect(report([first, second]).issues).toEqual([issue, issue]);
  });

  it("rejects malformed cyclic records as diagnostics rather than throwing", () => {
    const payload = plot();
    Object.assign(payload, { extensions: { cyclic: payload } });
    expect(report([payload]).issues.map((i) => i.code)).toEqual([
      "plot-invalid",
      "plot-membership-mismatch",
    ]);
  });

  it("does not interpret envelope-shaped extension fields as a persisted entity envelope", () => {
    expect(
      report([
        plot("plot", {
          type: "plot-definition",
          schemaVersion: 99,
          data: { unrelated: true },
        }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });

  it("does not fall back to valid facets to hide malformed runtime legacy claims", () => {
    const payload = plot("plot", {
      discoveries: [
        {
          id: "discovery",
          name: "Mixed",
          truth: { id: "truth", statement: "Fact." },
          beliefs: [
            { id: "belief", statement: "Belief.", relation: "supports" },
          ],
          rumors: [],
          claims: [null],
        },
      ],
    });
    expect(report([payload]).issues.map((i) => i.code)).toContain(
      "plot-invalid",
    );
  });
});
