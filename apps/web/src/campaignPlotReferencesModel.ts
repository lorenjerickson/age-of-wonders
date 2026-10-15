import { PlotDefinition } from "@aow/domain";
import type { CampaignDraftRecord } from "./campaignAuthoringModel";

/** Context membership requires reciprocal Plot support at the same Location. */
export function eligiblePlotContextPlacements(
  records: readonly CampaignDraftRecord[],
  plotId: string,
  locationId: unknown,
) {
  return PlotDefinition.authoringContextPlacements(records, plotId, locationId);
}
export function plotContextAssociationsValid(
  ids: readonly string[],
  records: readonly CampaignDraftRecord[],
  plotId: string,
  locationId: unknown,
) {
  return PlotDefinition.authoringContextAssociationsValid(
    ids,
    records,
    plotId,
    locationId,
  );
}
