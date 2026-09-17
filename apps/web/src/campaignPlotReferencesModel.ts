import {
  recordObject,
  type CampaignDraftRecord,
} from "./campaignAuthoringModel";

/** Context membership requires reciprocal Plot support at the same Location. */
export function eligiblePlotContextPlacements(
  records: readonly CampaignDraftRecord[],
  plotId: string,
  locationId: unknown,
) {
  return records.filter((record) => {
    if (record.resourceType !== "campaign-placements") return false;
    const placement = recordObject(record);
    return (
      placement.locationId === locationId &&
      Array.isArray(placement.plotDefinitionIds) &&
      placement.plotDefinitionIds.includes(plotId)
    );
  });
}
export function plotContextAssociationsValid(
  ids: readonly string[],
  records: readonly CampaignDraftRecord[],
  plotId: string,
  locationId: unknown,
) {
  const eligible = new Set(
    eligiblePlotContextPlacements(records, plotId, locationId).map(
      (record) => record.sourceId,
    ),
  );
  return ids.every((id) => eligible.has(id));
}
