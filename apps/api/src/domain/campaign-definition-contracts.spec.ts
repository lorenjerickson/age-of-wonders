import type {
  CampaignDefinitionContent,
  CampaignDefinitionId,
  CampaignPlacementDefinition,
  CampaignPlacementDefinitionId,
  CreatureId,
  DefinitionId,
  LocationId,
  ModelSchemaReleaseId,
  PlotDefinition,
  PlotDefinitionId,
  WorldPlacementDefinition,
  WorldPlacementDefinitionId,
} from "../../../../packages/common/src/types";
import { validateCampaignDefinitionContent } from "../../../../packages/common/src/types";

const campaignId = "campaign-1" as CampaignDefinitionId;
const locationId = "harbor" as LocationId;
const creatureId = "bell-keeper" as CreatureId;
const itemId = "floodgate-key" as DefinitionId;
const rootPlotId = "root-plot" as PlotDefinitionId;
const childPlotId = "child-plot" as PlotDefinitionId;
const worldPlacementId = "keeper-at-harbor" as WorldPlacementDefinitionId;

const rootPlot: PlotDefinition = {
  id: rootPlotId,
  campaignDefinitionId: campaignId,
  parent: { kind: "root" },
  name: "The Bells Below",
  objectives: [],
  pressures: [],
  resistances: [],
  discoveries: [],
  locationContexts: [
    {
      id: "context-1",
      locationId,
      placementDefinitionIds: [
        "campaign-placement-2" as CampaignPlacementDefinitionId,
      ],
    },
  ],
};
const childPlot: PlotDefinition = {
  id: childPlotId,
  campaignDefinitionId: campaignId,
  parent: { kind: "subplot", parentPlotDefinitionId: rootPlotId },
  name: "Open the Floodgate",
  objectives: [],
  pressures: [],
  resistances: [],
  discoveries: [],
  locationContexts: [],
  prerequisites: [{ plotDefinitionId: rootPlotId }],
};
const independent: CampaignPlacementDefinition = {
  id: "campaign-placement-1" as CampaignPlacementDefinitionId,
  kind: "independent",
  name: "The hidden key",
  locationId,
  plotDefinitionIds: [rootPlotId, childPlotId],
  source: { kind: "world-item", itemDefinitionId: itemId },
};
const decoration: CampaignPlacementDefinition = {
  id: "campaign-placement-2" as CampaignPlacementDefinitionId,
  kind: "world-decoration",
  name: "Keeper knows about the bells",
  locationId,
  plotDefinitionIds: [rootPlotId],
  capturedWorldPlacementId: worldPlacementId,
};
const worldPlacement: WorldPlacementDefinition = {
  id: worldPlacementId,
  locationId,
  source: { kind: "world-creature", creatureId },
};
const content: CampaignDefinitionContent = {
  formatVersion: 1,
  gmPremise: "The bells hold back the river.",
  playerIntroduction: "Greybridge needs investigators.",
  plotDefinitionIds: [rootPlotId, childPlotId],
  placementDefinitionIds: [independent.id, decoration.id],
  modelSchemaReleaseIds: ["gm:campaign-model:1" as ModelSchemaReleaseId],
  preparation: { startingLocationId: locationId },
};

function context() {
  return {
    campaignDefinitionId: campaignId,
    capturedLocationIds: new Set([locationId]),
    capturedCreatureIds: new Set([creatureId]),
    capturedItemDefinitionIds: new Set([itemId]),
    capturedDefinitionIds: new Set([itemId]),
    capturedWorldPlacements: new Map([[worldPlacementId, worldPlacement]]),
  };
}

describe("Campaign Definition contracts", () => {
  it("accepts multiple Plot levels and independent/decorating placements against one capture", () => {
    expect(
      validateCampaignDefinitionContent(
        content,
        [rootPlot, childPlot],
        [independent, decoration],
        context(),
      ),
    ).toEqual({ valid: true, issues: [] });
  });

  it("rejects undeclared records, uncaptured sources, and mismatched World decorations", () => {
    const result = validateCampaignDefinitionContent(
      { ...content, plotDefinitionIds: [rootPlotId] },
      [rootPlot, childPlot],
      [
        {
          ...independent,
          source: {
            kind: "world-item",
            itemDefinitionId: "missing-item" as DefinitionId,
          },
        },
        { ...decoration, locationId: "elsewhere" as LocationId },
      ],
      context(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "plot-membership-mismatch",
        "placement-source-not-captured",
        "location-not-captured",
        "plot-context-placement-mismatch",
        "world-placement-location-mismatch",
      ]),
    );
  });

  it("keeps opaque identities out of validation details", () => {
    const opaque = "opaque-world-placement-id" as WorldPlacementDefinitionId;
    const result = validateCampaignDefinitionContent(
      content,
      [rootPlot, childPlot],
      [independent, { ...decoration, capturedWorldPlacementId: opaque }],
      context(),
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "world-placement-not-captured",
        subject: "Keeper knows about the bells",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(opaque);
  });
});
