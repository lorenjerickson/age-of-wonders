import {
  validateCampaignDefinitionContent,
  type CampaignDefinitionContent,
  type CampaignDefinitionId,
  type CampaignPlacementDefinition,
  type CreatureId,
  type DefinitionId,
  type LocationId,
  type PlotDefinition,
  type WorldPlacementDefinition,
  type WorldPlacementDefinitionId,
} from "@aow/common";
import type { CanonicalSnapshotManifest } from "../domain/snapshot-manifest";

export interface CampaignDraftRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly sourceRevision?: number;
  readonly payload: unknown;
}

export interface CampaignDraftValidationIssue {
  readonly code: string;
  readonly subject: string;
  readonly detail: string;
}

export interface CampaignDraftValidationReport {
  readonly valid: boolean;
  readonly issues: readonly CampaignDraftValidationIssue[];
}

const FORBIDDEN_RESOURCES = new Set([
  "sessions",
  "session",
  "memberships",
  "membership",
  "invitations",
  "invitation",
  "attendance",
  "event-log",
  "runtime",
  "campaign-instance-runtime",
  "characters",
]);

export function validateCampaignDefinitionDraft(
  campaignDefinitionId: string,
  contentValue: unknown,
  records: readonly CampaignDraftRecord[],
  capturedWorld: CanonicalSnapshotManifest,
): CampaignDraftValidationReport {
  const issues: CampaignDraftValidationIssue[] = [];
  const add = (code: string, subject: string, detail: string) =>
    issues.push({ code, subject, detail });
  if (!isCampaignContent(contentValue)) {
    add(
      "campaign-content-invalid",
      "Campaign Definition",
      "Campaign content is incomplete or malformed.",
    );
  }

  const seen = new Set<string>();
  const plots: PlotDefinition[] = [];
  const placements: CampaignPlacementDefinition[] = [];
  for (const record of records) {
    const resourceType = record.resourceType.trim();
    const sourceId = record.sourceId.trim();
    const key = `${resourceType}\0${sourceId}`;
    if (!resourceType || !sourceId || seen.has(key)) {
      add(
        "campaign-record-identity-invalid",
        "Campaign content",
        "Campaign records require unique, non-empty identities.",
      );
      continue;
    }
    seen.add(key);
    if (
      resourceType === "campaign-definition-revision" ||
      FORBIDDEN_RESOURCES.has(resourceType)
    ) {
      add(
        "campaign-record-forbidden",
        "Campaign content",
        "Runtime, participation, and reserved records cannot be authored in a Campaign Definition.",
      );
      continue;
    }
    if (resourceType === "plots") {
      if (!isPlot(record.payload, sourceId)) {
        add("plot-invalid", "Plot", "A Plot record is malformed.");
      } else plots.push(record.payload as PlotDefinition);
      continue;
    }
    if (resourceType === "campaign-placements") {
      if (!isCampaignPlacement(record.payload, sourceId)) {
        add(
          "campaign-placement-invalid",
          "Campaign placement",
          "A Campaign placement record is malformed.",
        );
      } else placements.push(record.payload as CampaignPlacementDefinition);
      continue;
    }
    add(
      "campaign-record-type-unsupported",
      "Campaign content",
      "This Campaign record type is not supported by the current authoring model.",
    );
  }

  if (isCampaignContent(contentValue)) {
    const world = worldContext(capturedWorld);
    for (const issue of validateCampaignDefinitionContent(
      contentValue,
      plots,
      placements,
      {
        campaignDefinitionId: campaignDefinitionId as CampaignDefinitionId,
        capturedLocationIds: world.locations,
        capturedCreatureIds: world.creatures,
        capturedItemDefinitionIds: world.items,
        capturedDefinitionIds: world.definitions,
        capturedWorldPlacements: world.placements,
      },
    ).issues) {
      add(issue.code, issue.subject, issue.detail);
    }
    for (const canvas of contentValue.preparation?.locationCanvases ?? []) {
      if (!world.locations.has(canvas.locationId)) {
        add(
          "location-not-captured",
          "Campaign preparation",
          "A prepared canvas Location is not present in the captured World.",
        );
      }
    }
    validatePlotMemberIdentity(plots, add);
    for (const placement of placements) {
      if (new Set(placement.plotDefinitionIds).size !== placement.plotDefinitionIds.length) {
        add(
          "placement-plot-id-duplicate",
          placement.name?.trim() || "Campaign placement",
          "A Plot may be associated with a placement only once.",
        );
      }
      if (
        placement.kind === "independent" &&
        placement.source.kind === "actor-role" &&
        placement.source.suggestedCreatureDefinitionId !== undefined &&
        !world.creatures.has(placement.source.suggestedCreatureDefinitionId as unknown as CreatureId)
      ) {
        add(
          "placement-source-not-creature",
          placement.name?.trim() || "Campaign placement",
          "The suggested source must be a captured Creature definition.",
        );
      }
    }
  }
  issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.subject.localeCompare(right.subject),
  );
  return { valid: issues.length === 0, issues };
}

function isCampaignContent(value: unknown): value is CampaignDefinitionContent {
  if (!isObject(value)) return false;
  return (
    value.formatVersion === 1 &&
    typeof value.gmPremise === "string" &&
    isSafeCampaignRichText(value.gmPremise) &&
    typeof value.playerIntroduction === "string" &&
    isSafeCampaignRichText(value.playerIntroduction) &&
    stringArray(value.plotDefinitionIds) &&
    stringArray(value.placementDefinitionIds) &&
    stringArray(value.modelSchemaReleaseIds) &&
    (value.preparation === undefined || isPreparation(value.preparation))
  );
}

function isPlot(value: unknown, sourceId: string): boolean {
  if (!isObject(value) || value.id !== sourceId) return false;
  if (
    typeof value.campaignDefinitionId !== "string" ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    !isObject(value.parent) ||
    !Array.isArray(value.objectives) ||
    !Array.isArray(value.pressures) ||
    !Array.isArray(value.resistances) ||
    !Array.isArray(value.discoveries) ||
    !Array.isArray(value.locationContexts) ||
    !value.objectives.every(isNamedComponent) ||
    !value.pressures.every(isNamedComponent) ||
    !value.resistances.every(isNamedComponent) ||
    !value.discoveries.every(isDiscovery) ||
    !value.locationContexts.every(isLocationContext) ||
    !optionalConformance(value.conformance) ||
    !optionalModelValues(value.modelValues) ||
    !optionalRelationships(value.prerequisites) ||
    !optionalRelationships(value.dependencies) ||
    (value.description !== undefined && typeof value.description !== "string")
  ) return false;
  return value.parent.kind === "root" ||
    (value.parent.kind === "subplot" &&
      typeof value.parent.parentPlotDefinitionId === "string");
}

function isCampaignPlacement(value: unknown, sourceId: string): boolean {
  if (
    !isObject(value) ||
    value.id !== sourceId ||
    typeof value.locationId !== "string" ||
    !stringArray(value.plotDefinitionIds)
  ) return false;
  if (value.kind === "world-decoration") {
    return typeof value.capturedWorldPlacementId === "string" &&
      !("source" in value) && commonPlacementFields(value);
  }
  return value.kind === "independent" && !("capturedWorldPlacementId" in value) &&
    isIndependentSource(value.source) && commonPlacementFields(value);
}

function isNamedComponent(value: unknown): boolean {
  return isObject(value) && nonEmpty(value.id) && nonEmpty(value.name) &&
    (value.description === undefined || typeof value.description === "string");
}

function isDiscovery(value: unknown): boolean {
  if (!isNamedComponent(value)) return false;
  const claims = (value as Record<string, unknown>).claims;
  return Array.isArray(claims) && claims.length > 0 && claims.every(isClaim);
}

function isClaim(value: unknown): boolean {
  if (!isObject(value) || !nonEmpty(value.id) || !nonEmpty(value.statement)) return false;
  if (value.provenance !== undefined && typeof value.provenance !== "string") return false;
  if (value.kind === "truth")
    return value.conflictsWithClaimIds === undefined && value.relatedTruthClaimId === undefined;
  if (value.kind === "belief")
    return optionalStringArray(value.conflictsWithClaimIds) && value.relatedTruthClaimId === undefined;
  return value.kind === "rumor" && optionalStringArray(value.conflictsWithClaimIds) &&
    (value.relatedTruthClaimId === undefined || nonEmpty(value.relatedTruthClaimId));
}

function isLocationContext(value: unknown): boolean {
  if (!isObject(value) || !nonEmpty(value.id) || !nonEmpty(value.locationId) ||
      !optionalStringArray(value.placementDefinitionIds)) return false;
  return (value.actorPlacements === undefined ||
      (Array.isArray(value.actorPlacements) && value.actorPlacements.length === 0)) &&
    (value.itemPlacements === undefined ||
      (Array.isArray(value.itemPlacements) && value.itemPlacements.length === 0));
}

function optionalRelationships(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) =>
    isObject(entry) && nonEmpty(entry.plotDefinitionId) &&
    (entry.crossBranchRationale === undefined || nonEmpty(entry.crossBranchRationale))));
}

function commonPlacementFields(value: Record<string, unknown>): boolean {
  return (value.name === undefined || typeof value.name === "string") &&
    (value.notes === undefined || typeof value.notes === "string") &&
    (value.scale === undefined || (typeof value.scale === "number" && Number.isFinite(value.scale) && value.scale > 0)) &&
    (value.mapPosition === undefined || isCoordinate(value.mapPosition)) &&
    optionalConformance(value.conformance) &&
    optionalModelValues(value.modelValues);
}

function optionalConformance(value: unknown): boolean {
  return value === undefined || (
    isObject(value) &&
    nonEmpty(value.conceptId) &&
    stringArray(value.modelSchemaReleaseIds)
  );
}

function optionalModelValues(value: unknown): boolean {
  return value === undefined || (isObject(value) && Object.values(value).every(isJsonValue));
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.values(value).every(isJsonValue);
}

function isIndependentSource(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (value.kind === "world-creature") return nonEmpty(value.creatureId);
  if (value.kind === "world-item") return nonEmpty(value.itemDefinitionId);
  if (value.kind === "registered-content") return nonEmpty(value.definitionId);
  return value.kind === "actor-role" && nonEmpty(value.role) &&
    (value.suggestedCreatureDefinitionId === undefined || nonEmpty(value.suggestedCreatureDefinitionId));
}

function isPreparation(value: unknown): boolean {
  if (!isObject(value) ||
      (value.startingLocationId !== undefined && !nonEmpty(value.startingLocationId)) ||
      (value.startingContext !== undefined && !boundedText(value.startingContext, 20_000)) ||
      (value.mapVariations !== undefined && !boundedText(value.mapVariations, 20_000)) ||
      (value.locationCanvases !== undefined && !Array.isArray(value.locationCanvases))) return false;
  return value.locationCanvases === undefined || value.locationCanvases.every(isCanvas);
}

function validatePlotMemberIdentity(
  plots: readonly PlotDefinition[],
  add: (code: string, subject: string, detail: string) => void,
): void {
  for (const plot of plots) {
    uniqueMemberIds(plot.objectives, "plot-objective-id-duplicate", plot.name, "Objective", add);
    uniqueMemberIds(plot.pressures, "plot-pressure-id-duplicate", plot.name, "Pressure", add);
    uniqueMemberIds(plot.resistances, "plot-resistance-id-duplicate", plot.name, "Resistance", add);
    uniqueMemberIds(plot.discoveries, "plot-discovery-id-duplicate", plot.name, "Discovery", add);
    uniqueMemberIds(plot.locationContexts, "plot-location-context-id-duplicate", plot.name, "Location context", add);
    const claims = plot.discoveries.flatMap((discovery) => discovery.claims);
    const claimIds = new Set<string>();
    for (const claim of claims) {
      if (claimIds.has(claim.id)) {
        add("plot-claim-id-duplicate", plot.name, "Claim identities must be unique within a Plot.");
      }
      claimIds.add(claim.id);
    }
    const truthIds = new Set(
      claims.filter((claim) => claim.kind === "truth").map((claim) => claim.id),
    );
    for (const claim of claims) {
      const conflicts = claim.kind === "truth" ? [] : claim.conflictsWithClaimIds ?? [];
      if (new Set(conflicts).size !== conflicts.length) {
        add("claim-conflict-id-duplicate", plot.name, "A Claim conflict may be referenced only once.");
      }
      if (conflicts.some((id) => !claimIds.has(id))) {
        add("claim-conflict-not-found", plot.name, "A Claim conflict is not present in this Plot.");
      }
      if (conflicts.includes(claim.id)) {
        add("claim-self-conflict", plot.name, "A Claim cannot conflict with itself.");
      }
      if (
        claim.kind === "rumor" &&
        claim.relatedTruthClaimId !== undefined &&
        !truthIds.has(claim.relatedTruthClaimId)
      ) {
        add("claim-related-truth-not-found", plot.name, "A Rumor's related Truth is not present in this Plot.");
      }
    }
  }
}

function uniqueMemberIds(
  values: readonly { readonly id: string }[],
  code: string,
  subject: string,
  label: string,
  add: (code: string, subject: string, detail: string) => void,
): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) {
    add(code, subject, `${label} identities must be unique within a Plot.`);
  }
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

export function isSafeCampaignRichText(value: string): boolean {
  if (value.length > 50_000 || /<!--[\s\S]*?-->/.test(value)) return false;
  const allowed = new Set(["p", "h2", "h3", "strong", "em", "ul", "ol", "li", "blockquote", "br", "a"]);
  const stack: string[] = [];
  const tagPattern = /<[^>]*>/g;
  let cursor = 0;
  for (const match of value.matchAll(tagPattern)) {
    const index = match.index ?? 0;
    if (/[<>]/.test(value.slice(cursor, index))) return false;
    const raw = match[0];
    const parsed = raw.match(/^<\s*(\/?)\s*([A-Za-z0-9]+)([\s\S]*?)\s*(\/?)>$/);
    if (!parsed) return false;
    const closing = parsed[1] === "/";
    const tag = parsed[2].toLowerCase();
    const attributes = parsed[3] ?? "";
    const selfClosing = parsed[4] === "/" || tag === "br";
    if (!allowed.has(tag)) return false;
    if (closing) {
      if (attributes.trim() || selfClosing || stack.pop() !== tag) return false;
    } else {
      if (tag === "a") {
        const href = attributes.match(/^\s+href\s*=\s*(["'])([^"']*)\1\s*$/i)?.[2];
        if (!href || !safeHref(href)) return false;
      } else if (attributes.trim()) return false;
      if (!selfClosing) stack.push(tag);
    }
    cursor = index + raw.length;
  }
  return stack.length === 0 && !/[<>]/.test(value.slice(cursor));
}

function safeHref(value: string): boolean {
  const href = value.trim();
  if (!href || href.length > 2_048 ||
      [...href].some((character) => character === "\\" || character.charCodeAt(0) <= 31)) return false;
  const lower = href.toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://") ||
    lower.startsWith("mailto:") || lower.startsWith("#") ||
    (lower.startsWith("/") && !lower.startsWith("//"));
}

function isCanvas(value: unknown): boolean {
  if (!isObject(value) || !nonEmpty(value.locationId) || !Array.isArray(value.layers) ||
      (value.pixelsPerFiveFeet !== undefined && (!finite(value.pixelsPerFiveFeet) || value.pixelsPerFiveFeet <= 0)) ||
      !value.layers.every(isLayer)) return false;
  return optionalArray(value.lightSources, isLight) &&
    optionalArray(value.soundSources, isSound) &&
    optionalArray(value.drawings, isSizedCanvasObject) &&
    optionalArray(value.templates, isSizedCanvasObject) &&
    optionalArray(value.notes, isNote);
}

function isLayer(value: unknown): boolean {
  return isObject(value) && typeof value.key === "string" && CANVAS_LAYER_KEYS.has(value.key) && typeof value.visible === "boolean" &&
    finite(value.opacity) && value.opacity >= 0 && value.opacity <= 1;
}

function isLight(value: unknown): boolean {
  return canvasIdentity(value) && isCoordinate(value.position) && normalized(value.radius) && nonEmpty(value.color);
}

function isSound(value: unknown): boolean {
  return canvasIdentity(value) && isCoordinate(value.position) && normalized(value.radius) &&
    normalized(value.volume) && (value.volumeMode === "distance" || value.volumeMode === "constant") &&
    typeof value.loop === "boolean";
}

function isSizedCanvasObject(value: unknown): boolean {
  return canvasIdentity(value) && isCoordinate(value.position) && normalized(value.radius);
}

function isNote(value: unknown): boolean {
  return canvasIdentity(value) && isCoordinate(value.position) && typeof value.text === "string";
}

function canvasIdentity(value: unknown): value is Record<string, unknown> {
  return isObject(value) && nonEmpty(value.id) && nonEmpty(value.name);
}

function optionalArray(value: unknown, predicate: (entry: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && value.every(predicate));
}

function normalized(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function isCoordinate(value: unknown): boolean {
  return isObject(value) && finite(value.x) && finite(value.y) &&
    value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalStringArray(value: unknown): boolean {
  return value === undefined || stringArray(value);
}

const CANVAS_LAYER_KEYS = new Set([
  "background", "background-effects", "tiles", "grid", "regions", "drawings",
  "templates", "walls", "tokens", "sounds", "lighting", "notes", "controls",
  "special-effects", "illumination-effects", "coloration-effects", "darkness-effects",
  "visibility", "particle-effects", "weather-effects", "filter-effects", "interface",
]);

function worldContext(manifest: CanonicalSnapshotManifest) {
  const locations = new Set<LocationId>();
  const creatures = new Set<CreatureId>();
  const items = new Set<DefinitionId>();
  const definitions = new Set<DefinitionId>();
  const placements = new Map<
    WorldPlacementDefinitionId,
    WorldPlacementDefinition
  >();
  const canonicalDefinitions = new Set<string>();
  for (const record of manifest.records) {
    const id = record.sourceId;
    if (record.resourceType === "locations") locations.add(id as LocationId);
    if (record.resourceType === "definitions") {
      canonicalDefinitions.add(id);
      definitions.add(id as DefinitionId);
      if (isObject(record.payload) && record.payload.kind === "creature")
        creatures.add(id as CreatureId);
      if (isObject(record.payload) && record.payload.kind === "item")
        items.add(id as DefinitionId);
    }
    if (
      record.resourceType === "world-placements" &&
      isObject(record.payload) &&
      record.payload.id === id &&
      typeof record.payload.locationId === "string" &&
      isObject(record.payload.source)
    ) {
      placements.set(
        id as WorldPlacementDefinitionId,
        record.payload as unknown as WorldPlacementDefinition,
      );
    }
  }
  for (const record of manifest.records) {
    if (
      record.resourceType === "creatures" &&
      !canonicalDefinitions.has(record.sourceId)
    ) {
      creatures.add(record.sourceId as CreatureId);
    }
  }
  return { locations, creatures, items, definitions, placements };
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
