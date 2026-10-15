import { PlotDefinition as PlotOwner } from "./plot-definition";
import type {
  CampaignDefinitionContent,
  CampaignDefinitionValidationContext,
  CampaignDefinitionValidationResult,
  CampaignDefinitionValidationIssue,
  CampaignDefinitionValidationIssueCode,
  CampaignPlacementDefinition,
  CampaignIndependentPlacementSource,
  PlotDefinition,
} from "@aow/common";
/** Validates authored Campaign records against one exact captured World. */
export function validateCampaignDefinitionContent(
  content: CampaignDefinitionContent,
  plots: readonly PlotDefinition[],
  placements: readonly CampaignPlacementDefinition[],
  context: CampaignDefinitionValidationContext,
): CampaignDefinitionValidationResult {
  const issues: CampaignDefinitionValidationIssue[] = [];
  const add = (
    code: CampaignDefinitionValidationIssueCode,
    subject: string,
    detail: string,
  ) => issues.push({ code, subject, detail });

  compareMembership(
    content.plotDefinitionIds,
    plots.map(({ id }) => id),
    "plot-membership-mismatch",
    "Campaign Definition",
    "The declared Plot collection must exactly match the captured Plot records.",
    add,
  );
  compareMembership(
    content.placementDefinitionIds,
    placements.map(({ id }) => id),
    "placement-membership-mismatch",
    "Campaign Definition",
    "The declared placement collection must exactly match the captured placement records.",
    add,
  );
  if (
    new Set(content.modelSchemaReleaseIds).size !==
    content.modelSchemaReleaseIds.length
  ) {
    add(
      "model-release-duplicate",
      "Campaign Definition",
      "An exact Model Schema release may be selected only once.",
    );
  }

  for (const hierarchyIssue of PlotOwner.validateHierarchy(plots).issues) {
    add(hierarchyIssue.code, hierarchyIssue.plotName, hierarchyIssue.message);
  }

  const plotIds = new Set(plots.map(({ id }) => id));
  const placementsById = new Map(
    placements.map((placement) => [placement.id, placement]),
  );
  for (const plot of plots) {
    if (plot.campaignDefinitionId !== context.campaignDefinitionId) {
      add(
        "plot-campaign-mismatch",
        plot.name,
        "The Plot belongs to a different Campaign Definition.",
      );
    }
    for (const locationContext of plot.locationContexts) {
      if (!context.capturedLocationIds.has(locationContext.locationId)) {
        add(
          "location-not-captured",
          plot.name,
          "A Plot Location context is not present in the captured World.",
        );
      }
      for (const placementId of locationContext.placementDefinitionIds ?? []) {
        const placement = placementsById.get(placementId);
        if (!placement) {
          add(
            "plot-context-placement-not-found",
            plot.name,
            "A referenced Campaign placement is not present in this Campaign Definition.",
          );
        } else if (
          placement.locationId !== locationContext.locationId ||
          !placement.plotDefinitionIds.includes(plot.id)
        ) {
          add(
            "plot-context-placement-mismatch",
            plot.name,
            "A Plot Location context and its Campaign placement must reference one another at the same captured Location.",
          );
        }
      }
    }
  }

  const startingLocationId = content.preparation?.startingLocationId;
  if (
    startingLocationId !== undefined &&
    !context.capturedLocationIds.has(startingLocationId)
  ) {
    add(
      "location-not-captured",
      "Campaign preparation",
      "The starting Location is not present in the captured World.",
    );
  }

  for (const placement of placements) {
    const subject = placement.name?.trim() || "Campaign placement";
    if (!context.capturedLocationIds.has(placement.locationId)) {
      add(
        "location-not-captured",
        subject,
        "The placement Location is not present in the captured World.",
      );
    }
    for (const plotId of placement.plotDefinitionIds) {
      if (!plotIds.has(plotId)) {
        add(
          "placement-plot-not-found",
          subject,
          "A related Plot is not present in this Campaign Definition.",
        );
      }
    }
    if (placement.kind === "independent") {
      if (!sourceIsCaptured(placement.source, context)) {
        add(
          "placement-source-not-captured",
          subject,
          "The placement source is not present in the captured World content.",
        );
      }
      continue;
    }
    const captured = context.capturedWorldPlacements.get(
      placement.capturedWorldPlacementId,
    );
    if (!captured) {
      add(
        "world-placement-not-captured",
        subject,
        "The decorated World placement is not present in the captured World.",
      );
    } else if (captured.locationId !== placement.locationId) {
      add(
        "world-placement-location-mismatch",
        subject,
        "The decoration must use the captured World placement's Location.",
      );
    }
  }

  issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.subject.localeCompare(right.subject),
  );
  return { valid: issues.length === 0, issues };
}

function compareMembership<Id extends string>(
  declared: readonly Id[],
  captured: readonly Id[],
  code: CampaignDefinitionValidationIssueCode,
  subject: string,
  detail: string,
  add: (
    code: CampaignDefinitionValidationIssueCode,
    subject: string,
    detail: string,
  ) => void,
): void {
  if (
    new Set(declared).size !== declared.length ||
    new Set(captured).size !== captured.length ||
    declared.length !== captured.length ||
    declared.some((id) => !captured.includes(id))
  ) {
    add(code, subject, detail);
  }
}

function sourceIsCaptured(
  source: CampaignIndependentPlacementSource,
  context: CampaignDefinitionValidationContext,
): boolean {
  if (source.kind === "world-creature") {
    return context.capturedCreatureIds.has(source.creatureId);
  }
  if (source.kind === "world-item") {
    return context.capturedItemDefinitionIds.has(source.itemDefinitionId);
  }
  if (source.kind === "registered-content") {
    return context.capturedDefinitionIds.has(source.definitionId);
  }
  return (
    source.suggestedCreatureDefinitionId === undefined ||
    context.capturedDefinitionIds.has(source.suggestedCreatureDefinitionId)
  );
}
