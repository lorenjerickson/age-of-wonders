import { PlotDefinition as PlotOwner } from "@aow/domain";
import type { CampaignDefinitionId, PlotDefinitionId } from "@aow/common";
import { type PlotDefinition } from "@aow/common";

const campaign = (value: string) => value as CampaignDefinitionId;
const plot = (value: string) => value as PlotDefinitionId;

function plotDefinition(
  id: string,
  name: string,
  campaignDefinitionId = campaign("campaign-a"),
  parentPlotDefinitionId?: string,
  relationships?: {
    prerequisites?: PlotDefinition["prerequisites"];
    dependencies?: PlotDefinition["dependencies"];
  },
): PlotDefinition {
  return {
    id: plot(id),
    campaignDefinitionId,
    parent: parentPlotDefinitionId
      ? {
          kind: "subplot",
          parentPlotDefinitionId: plot(parentPlotDefinitionId),
        }
      : { kind: "root" },
    name,
    objectives: [],
    pressures: [],
    resistances: [],
    discoveries: [],
    locationContexts: [],
    prerequisites: relationships?.prerequisites,
    dependencies: relationships?.dependencies,
  };
}

describe("validatePlotHierarchy", () => {
  it("accepts multiple roots, recursive subplots, and upward relationships", () => {
    const result = PlotOwner.validateHierarchy([
      plotDefinition("root-a", "The Signal"),
      plotDefinition(
        "child-a",
        "Find the Source",
        campaign("campaign-a"),
        "root-a",
        {
          prerequisites: [{ plotDefinitionId: plot("root-a") }],
        },
      ),
      plotDefinition(
        "grandchild-a",
        "Enter the Vault",
        campaign("campaign-a"),
        "child-a",
        {
          dependencies: [{ plotDefinitionId: plot("root-a") }],
        },
      ),
      plotDefinition("root-b", "The Rival Expedition"),
    ]);

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("rejects parent cycles and cross-definition parentage", () => {
    const result = PlotOwner.validateHierarchy([
      plotDefinition("cycle-a", "Cycle A", campaign("campaign-a"), "cycle-b"),
      plotDefinition("cycle-b", "Cycle B", campaign("campaign-a"), "cycle-a"),
      plotDefinition("foreign-root", "Foreign Root", campaign("campaign-b")),
      plotDefinition(
        "foreign-child",
        "Foreign Child",
        campaign("campaign-a"),
        "foreign-root",
      ),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "plot-parent-crosses-campaign-definition",
      "plot-parent-cycle",
    ]);
    expect(result.issues.map((issue) => issue.message).join(" ")).not.toMatch(
      /cycle-a|cycle-b|foreign-root/,
    );
  });

  it("rejects combined prerequisite/dependency cycles and unmarked cross-branch relationships", () => {
    const result = PlotOwner.validateHierarchy([
      plotDefinition("root", "Root"),
      plotDefinition("left", "Left Branch", campaign("campaign-a"), "root", {
        prerequisites: [{ plotDefinitionId: plot("right") }],
      }),
      plotDefinition("right", "Right Branch", campaign("campaign-a"), "root", {
        dependencies: [
          {
            plotDefinitionId: plot("left"),
            crossBranchRationale: "The rival branches constrain one another.",
          },
        ],
      }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "plot-cross-branch-relationship-unexplained",
      "plot-relationship-cycle",
    ]);
  });

  it("rejects prerequisite and dependency targets from another Campaign Definition", () => {
    const result = PlotOwner.validateHierarchy([
      plotDefinition("local", "Local Plot", campaign("campaign-a"), undefined, {
        dependencies: [
          {
            plotDefinitionId: plot("foreign"),
            crossBranchRationale:
              "An explicit but invalid external dependency.",
          },
        ],
      }),
      plotDefinition("foreign", "Foreign Plot", campaign("campaign-b")),
    ]);

    expect(result).toMatchObject({
      valid: false,
      issues: [{ code: "plot-relationship-crosses-campaign-definition" }],
    });
  });
});
