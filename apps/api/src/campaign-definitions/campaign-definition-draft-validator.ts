import {
  PlacementDefinition,
  PlotDefinition as PlotEntity,
  type PlotDefinitionValidationIssue,
} from "@aow/domain";
import {
  type CampaignDefinitionContent,
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
    // Campaign owns aggregate membership; each authored entity owns its own policy.
    compareMembership(
      contentValue.plotDefinitionIds,
      plots.map(({ id }) => id),
      "plot-membership-mismatch",
      "The declared Plot collection must exactly match the captured Plot records.",
      add,
    );
    compareMembership(
      contentValue.placementDefinitionIds,
      placements.map(({ id }) => id),
      "placement-membership-mismatch",
      "The declared placement collection must exactly match the captured placement records.",
      add,
    );
    if (
      new Set(contentValue.modelSchemaReleaseIds).size !==
      contentValue.modelSchemaReleaseIds.length
    )
      add(
        "model-release-duplicate",
        "Campaign Definition",
        "An exact Model Schema release may be selected only once.",
      );
    for (const [plotIndex, plot] of plots.entries()) {
      const entity = PlotEntity.deserializePayload(plot, {
        mode: "publication",
        sourceId: plot.id,
        campaignDefinitionId,
        plots,
        placements,
        capturedLocationIds: [...world.locations],
      });
      try {
        for (const issue of entity.state.metadata.validity.issues) {
          const subject = (issue as PlotDefinitionValidationIssue).subject;
          // Each Plot has the same complete graph evidence. Project that list once,
          // retaining distinct diagnostics even when multiple Plots share a name.
          if (issue.path === "hierarchy" && plotIndex > 0) continue;
          add(issue.code, subject, issue.message);
        }
      } finally {
        entity.dispose();
      }
    }
    for (const placement of placements) {
      const entity = PlacementDefinition.deserializePayload(placement, {
        scope: "campaign",
        mode: "publication",
        sourceId: placement.id,
        capturedLocationIds: [...world.locations],
        capturedCreatureIds: [...world.creatures],
        capturedItemDefinitionIds: [...world.items],
        capturedDefinitionIds: [...world.definitions],
        capturedWorldPlacements: [...world.placements.values()],
        plotIds: plots.map(({ id }) => id),
      });
      try {
        for (const issue of entity.state.metadata.validity.issues)
          add(
            issue.code,
            placement.name?.trim() || "Campaign placement",
            issue.message,
          );
      } finally {
        entity.dispose();
      }
    }
    if (
      contentValue.preparation?.startingLocationId !== undefined &&
      !world.locations.has(contentValue.preparation.startingLocationId)
    )
      add(
        "location-not-captured",
        "Campaign preparation",
        "The starting Location is not present in the captured World.",
      );
    for (const canvas of contentValue.preparation?.locationCanvases ?? []) {
      if (!world.locations.has(canvas.locationId)) {
        add(
          "location-not-captured",
          "Campaign preparation",
          "A prepared canvas Location is not present in the captured World.",
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
  try {
    const entity = PlotEntity.deserializePayload(value, {
      sourceId,
      validationMode: "shape",
    });
    try {
      return entity.state.metadata.validity.status === "valid";
    } finally {
      entity.dispose();
    }
  } catch {
    return false;
  }
}

function isCampaignPlacement(value: unknown, sourceId: string): boolean {
  try {
    const entity = PlacementDefinition.deserializePayload(value, {
      scope: "campaign",
      sourceId,
      validationMode: "shape",
    });
    try {
      return entity.state.metadata.validity.status === "valid";
    } finally {
      entity.dispose();
    }
  } catch {
    return false;
  }
}

function compareMembership(
  declared: readonly string[],
  captured: readonly string[],
  code: string,
  detail: string,
  add: (code: string, subject: string, detail: string) => void,
): void {
  if (
    new Set(declared).size !== declared.length ||
    new Set(captured).size !== captured.length ||
    declared.length !== captured.length ||
    declared.some((id) => !captured.includes(id))
  )
    add(code, "Campaign Definition", detail);
}

function isPreparation(value: unknown): boolean {
  if (
    !isObject(value) ||
    (value.startingLocationId !== undefined &&
      !nonEmpty(value.startingLocationId)) ||
    (value.startingContext !== undefined &&
      !boundedText(value.startingContext, 20_000)) ||
    (value.mapVariations !== undefined &&
      !boundedText(value.mapVariations, 20_000)) ||
    (value.locationCanvases !== undefined &&
      !Array.isArray(value.locationCanvases))
  )
    return false;
  return (
    value.locationCanvases === undefined ||
    value.locationCanvases.every(isCanvas)
  );
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

export function isSafeCampaignRichText(value: string): boolean {
  if (value.length > 50_000 || /<!--[\s\S]*?-->/.test(value)) return false;
  const allowed = new Set([
    "p",
    "h2",
    "h3",
    "strong",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "br",
    "a",
  ]);
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
        const href = attributes.match(
          /^\s+href\s*=\s*(["'])([^"']*)\1\s*$/i,
        )?.[2];
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
  if (
    !href ||
    href.length > 2_048 ||
    [...href].some(
      (character) => character === "\\" || character.charCodeAt(0) <= 31,
    )
  )
    return false;
  const lower = href.toLowerCase();
  return (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("#") ||
    (lower.startsWith("/") && !lower.startsWith("//"))
  );
}

function isCanvas(value: unknown): boolean {
  if (
    !isObject(value) ||
    !nonEmpty(value.locationId) ||
    !Array.isArray(value.layers) ||
    (value.pixelsPerFiveFeet !== undefined &&
      (!finite(value.pixelsPerFiveFeet) || value.pixelsPerFiveFeet <= 0)) ||
    !value.layers.every(isLayer)
  )
    return false;
  return (
    optionalArray(value.lightSources, isLight) &&
    optionalArray(value.soundSources, isSound) &&
    optionalArray(value.drawings, isSizedCanvasObject) &&
    optionalArray(value.templates, isSizedCanvasObject) &&
    optionalArray(value.notes, isNote)
  );
}

function isLayer(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.key === "string" &&
    CANVAS_LAYER_KEYS.has(value.key) &&
    typeof value.visible === "boolean" &&
    finite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1
  );
}

function isLight(value: unknown): boolean {
  return (
    canvasIdentity(value) &&
    isCoordinate(value.position) &&
    normalized(value.radius) &&
    nonEmpty(value.color)
  );
}

function isSound(value: unknown): boolean {
  return (
    canvasIdentity(value) &&
    isCoordinate(value.position) &&
    normalized(value.radius) &&
    normalized(value.volume) &&
    (value.volumeMode === "distance" || value.volumeMode === "constant") &&
    typeof value.loop === "boolean"
  );
}

function isSizedCanvasObject(value: unknown): boolean {
  return (
    canvasIdentity(value) &&
    isCoordinate(value.position) &&
    normalized(value.radius)
  );
}

function isNote(value: unknown): boolean {
  return (
    canvasIdentity(value) &&
    isCoordinate(value.position) &&
    typeof value.text === "string"
  );
}

function canvasIdentity(value: unknown): value is Record<string, unknown> {
  return isObject(value) && nonEmpty(value.id) && nonEmpty(value.name);
}

function optionalArray(
  value: unknown,
  predicate: (entry: unknown) => boolean,
): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.every(predicate))
  );
}

function normalized(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function isCoordinate(value: unknown): boolean {
  return (
    isObject(value) &&
    finite(value.x) &&
    finite(value.y) &&
    value.x >= 0 &&
    value.x <= 1 &&
    value.y >= 0 &&
    value.y <= 1
  );
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const CANVAS_LAYER_KEYS = new Set([
  "background",
  "background-effects",
  "tiles",
  "grid",
  "regions",
  "drawings",
  "templates",
  "walls",
  "tokens",
  "sounds",
  "lighting",
  "notes",
  "controls",
  "special-effects",
  "illumination-effects",
  "coloration-effects",
  "darkness-effects",
  "visibility",
  "particle-effects",
  "weather-effects",
  "filter-effects",
  "interface",
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
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
