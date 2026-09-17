import { describe, expect, it } from "vitest";
import {
  eligiblePlotContextPlacements,
  plotContextAssociationsValid,
} from "./campaignPlotReferencesModel";
import type { CampaignDraftRecord } from "./campaignAuthoringModel";
const records: CampaignDraftRecord[] = [
  {
    sourceId: "valid",
    resourceType: "campaign-placements",
    payload: { locationId: "harbor", plotDefinitionIds: ["bell", "tower"] },
  },
  {
    sourceId: "other-location",
    resourceType: "campaign-placements",
    payload: { locationId: "tower", plotDefinitionIds: ["bell"] },
  },
  {
    sourceId: "other-plot",
    resourceType: "campaign-placements",
    payload: { locationId: "harbor", plotDefinitionIds: ["tower"] },
  },
  {
    sourceId: "not-placement",
    resourceType: "plots",
    payload: { locationId: "harbor", plotDefinitionIds: ["bell"] },
  },
];
describe("Plot context association eligibility", () => {
  it("requires same Location and reciprocal Plot support", () => {
    expect(
      eligiblePlotContextPlacements(records, "bell", "harbor").map(
        (record) => record.sourceId,
      ),
    ).toEqual(["valid"]);
  });
  it("blocks Location changes with incompatible or missing associations until removal", () => {
    expect(
      plotContextAssociationsValid(["valid"], records, "bell", "harbor"),
    ).toBe(true);
    expect(
      plotContextAssociationsValid(["valid"], records, "bell", "tower"),
    ).toBe(false);
    expect(
      plotContextAssociationsValid(["missing"], records, "bell", "harbor"),
    ).toBe(false);
    expect(plotContextAssociationsValid([], records, "bell", "tower")).toBe(
      true,
    );
  });
});
