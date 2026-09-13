import { terrainSnapshotIssue } from "./terrain-snapshot";
import { isPublicationJson } from "../domain/snapshot-manifest";
import { isCreatureInstanceEmbodimentPolicy } from "@aow/common";
import type { WorldDraftRecordDto } from "./dto/world-definition-authoring.dto";
import { canonicalWorldRecordIssue } from "./world-authored-record";

export interface WorldDraftValidationIssue {
  readonly code: string;
  readonly subject: string;
  readonly detail: string;
}

export interface WorldDraftValidationReport {
  readonly valid: boolean;
  readonly issues: readonly WorldDraftValidationIssue[];
}

const RESERVED_RESOURCE = "world-definition-revision";

export function validateWorldDefinitionDraft(
  content: unknown,
  records: readonly WorldDraftRecordDto[],
): WorldDraftValidationReport {
  const issues: WorldDraftValidationIssue[] = [];
  const add = (code: string, subject: string, detail: string) =>
    issues.push({ code, subject, detail });
  if (!isObject(content) || !isPublicationJson(content)) {
    add(
      "content-invalid",
      "World draft",
      "The complete World content must be bounded JSON.",
    );
    return { valid: false, issues };
  }
  const ids = new Set<string>();
  const recordIdentities = new Set<string>();
  const byId = new Map<string, WorldDraftRecordDto>();
  for (const record of records) {
    const subject = recordName(record);
    if (record.resourceType.trim() === RESERVED_RESOURCE) {
      add(
        "reserved-record",
        subject,
        "The authoritative revision record is server-owned.",
      );
    }
    if (!isPublicationJson(record.payload)) {
      add(
        "record-invalid",
        subject,
        "The captured resource must be bounded JSON.",
      );
    }
    const key = `${record.resourceType.trim()}\0${record.sourceId.trim()}\0${record.sourceRevision ?? ""}`;
    const identityKey = `${record.resourceType.trim()}\0${record.sourceId.trim()}`;
    if (ids.has(key) || recordIdentities.has(identityKey))
      add(
        "duplicate-record",
        subject,
        "The same captured resource appears more than once.",
      );
    ids.add(key);
    recordIdentities.add(identityKey);
    byId.set(
      `${record.resourceType.trim()}\0${record.sourceId.trim()}`,
      record,
    );
  }
  const root = stringField(content, "rootLocationId");
  const locations = stringArray(content, "locationIds", add);
  const definitions = stringArray(content, "definitionIds", add);
  const schemas = stringArray(content, "schemaDefinitionIds", add);
  const worldPlacements = stringArray(
    content,
    "worldPlacementDefinitionIds",
    add,
  );
  const modelReleases = stringArray(content, "modelSchemaReleaseIds", add);
  if (modelReleases.length === 0)
    add(
      "model-release-missing",
      "World draft",
      "At least one exact Model Schema release is required.",
    );
  if (!root) add("root-missing", "World draft", "A root Location is required.");
  if (root && !locations.includes(root))
    add(
      "root-not-declared",
      "World draft",
      "The root Location must be in the Location collection.",
    );
  for (const id of locations)
    requireRecord(byId, "locations", id, "Location", add);
  for (const id of locations) {
    const record = byId.get(`locations\0${id}`);
    if (!record) continue;
    const detail = canonicalWorldRecordIssue("locations", id, record.payload);
    if (detail) add("location-definition-invalid", recordName(record), detail);
  }
  for (const id of definitions) {
    requireRecord(byId, "definitions", id, "Definition", add);
    const record = byId.get(`definitions\0${id}`);
    if (!record) continue;
    const detail = canonicalWorldRecordIssue("definitions", id, record.payload);
    if (detail) add("authored-definition-invalid", recordName(record), detail);
    if (isObject(record.payload) && record.payload.kind === "skill" && isObject(record.payload.components)) {
      const associated = record.payload.components.associatedProfessionIds;
      if (Array.isArray(associated)) for (const professionId of associated) {
        const profession = typeof professionId === "string" ? byId.get(`definitions\0${professionId}`) : undefined;
        if (!profession || !definitions.includes(String(professionId)) || !isObject(profession.payload) || profession.payload.kind !== "profession")
          add("skill-profession-missing", recordName(record), "An associated Profession is unavailable in this World.");
      }
    }
  }
  validateCreatureEmbodimentPolicies(definitions, byId, add);
  validateCreatureDefinitionReferences(definitions, byId, add);
  for (const id of schemas) {
    if (
      !byId.has(`extension-schemas\0${id}`) &&
      !byId.has(`definitions\0${id}`)
    ) {
      add(
        "schema-record-missing",
        "World draft",
        "A declared schema is missing from the capture.",
      );
    }
  }
  const rootRecord = root ? byId.get(`locations\0${root}`) : undefined;
  if (rootRecord && isObject(rootRecord.payload)) {
    if (rootRecord.payload.kind !== "world")
      add(
        "root-kind-invalid",
        recordName(rootRecord),
        "The root Location must be a World.",
      );
    const placement = rootRecord.payload.placement;
    if (isObject(placement) && placement.kind !== "root")
      add(
        "root-placement-invalid",
        recordName(rootRecord),
        "The World Location must use root placement.",
      );
  }
  const terrainIssue = terrainSnapshotIssue(records);
  if (terrainIssue) add("terrain-capture-invalid", "Location terrain", terrainIssue);
  validateLocationGraph(locations, byId, add);
  validateWorldPlacements(
    worldPlacements,
    locations,
    definitions,
    records,
    byId,
    add,
  );
  issues.sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject),
  );
  return { valid: issues.length === 0, issues };
}

function validateCreatureDefinitionReferences(
  definitionIds: readonly string[],
  byId: ReadonlyMap<string, WorldDraftRecordDto>,
  add: (c: string, s: string, d: string) => void,
): void {
  for (const id of definitionIds) {
    const creature = byId.get(`definitions\0${id}`);
    if (
      !creature ||
      !isObject(creature.payload) ||
      creature.payload.kind !== "creature"
    )
      continue;
    const components = isObject(creature.payload.components)
      ? creature.payload.components
      : {};
    for (const [field, expectedKind, label] of [
      ["skillDefinitionIds", "skill", "Skill"],
      ["professionDefinitionIds", "profession", "Profession"],
    ] as const) {
      const references = Array.isArray(components[field])
        ? components[field]
        : [];
      for (const reference of references) {
        const target =
          typeof reference === "string"
            ? byId.get(`definitions\0${reference}`)
            : undefined;
        if (
          !target ||
          !definitionIds.includes(String(reference)) ||
          !isObject(target.payload) ||
          target.payload.kind !== expectedKind
        ) {
          add(
            "creature-definition-reference-invalid",
            recordName(creature),
            `Every referenced ${label} must be declared in this World draft.`,
          );
        }
      }
    }
  }
}

function validateCreatureEmbodimentPolicies(
  definitionIds: readonly string[],
  byId: ReadonlyMap<string, WorldDraftRecordDto>,
  add: (c: string, s: string, d: string) => void,
): void {
  for (const id of definitionIds) {
    const record = byId.get(`definitions\0${id}`);
    if (
      !record ||
      !isObject(record.payload) ||
      record.payload.kind !== "creature"
    ) {
      continue;
    }
    if (
      !isCreatureInstanceEmbodimentPolicy(
        record.payload.instanceEmbodimentPolicy,
      )
    ) {
      add(
        "creature-embodiment-policy-invalid",
        recordName(record),
        "A Creature Definition requires an explicit valid Instance embodiment policy.",
      );
    }
  }
}

function validateWorldPlacements(
  declaredIds: readonly string[],
  locationIds: readonly string[],
  definitionIds: readonly string[],
  records: readonly WorldDraftRecordDto[],
  byId: ReadonlyMap<string, WorldDraftRecordDto>,
  add: (c: string, s: string, d: string) => void,
): void {
  const declared = new Set(declaredIds);
  const locations = new Set(locationIds);
  const definitions = new Map<string, unknown>();
  for (const definitionId of definitionIds) {
    definitions.set(
      definitionId,
      byId.get(`definitions\0${definitionId}`)?.payload,
    );
  }
  const legacyCreatures = new Set(
    records
      .filter(
        (record) =>
          record.resourceType.trim() === "creatures" &&
          !definitions.has(record.sourceId.trim()),
      )
      .map((record) => record.sourceId.trim()),
  );
  const placementRecords = records.filter(
    (record) => record.resourceType.trim() === "world-placements",
  );
  for (const id of declaredIds) {
    if (!byId.has(`world-placements\0${id}`)) {
      add(
        "world-placement-record-missing",
        "World placements",
        "A declared World placement is missing from the capture.",
      );
    }
  }
  for (const record of placementRecords) {
    const subject = recordName(record);
    const id = record.sourceId.trim();
    if (!declared.has(id)) {
      add(
        "world-placement-membership-mismatch",
        subject,
        "Every captured World placement must be declared by this World revision.",
      );
    }
    if (!isWorldPlacement(record.payload, id)) {
      add(
        "world-placement-invalid",
        subject,
        "The World placement shape, presentation, or coordinates are invalid.",
      );
      continue;
    }
    if (!locations.has(record.payload.locationId)) {
      add(
        "world-placement-location-not-found",
        subject,
        "The placement Location is not present in this World revision.",
      );
    }
    if (
      !worldPlacementSourceExists(
        record.payload.source,
        definitions,
        legacyCreatures,
      )
    ) {
      add(
        "world-placement-source-not-found",
        subject,
        "The placed Creature, Item, or registered content is not present in this World revision.",
      );
    }
  }
}

function isWorldPlacement(
  value: unknown,
  sourceId: string,
): value is Record<string, unknown> & {
  locationId: string;
  source: Record<string, unknown>;
} {
  if (
    !isObject(value) ||
    value.id !== sourceId ||
    !boundedNonEmpty(value.locationId, 240) ||
    !onlyKeys(value, [
      "id",
      "locationId",
      "source",
      "name",
      "mapPosition",
      "scale",
      "notes",
      "conformance",
      "modelValues",
      "extensions",
    ]) ||
    (value.name !== undefined &&
      (typeof value.name !== "string" || value.name.length > 120)) ||
    (value.notes !== undefined &&
      (typeof value.notes !== "string" || value.notes.length > 4_000)) ||
    (value.scale !== undefined &&
      (!finite(value.scale) || value.scale <= 0 || value.scale > 100)) ||
    (value.mapPosition !== undefined &&
      !normalizedCoordinate(value.mapPosition)) ||
    (value.conformance !== undefined && !modelConformance(value.conformance)) ||
    (value.modelValues !== undefined &&
      !publicationObject(value.modelValues)) ||
    (value.extensions !== undefined && !isObject(value.extensions))
  ) {
    return false;
  }
  return isWorldPlacementSource(value.source);
}

function modelConformance(value: unknown): boolean {
  return (
    isObject(value) &&
    boundedNonEmpty(value.conceptId, 240) &&
    Array.isArray(value.modelSchemaReleaseIds) &&
    value.modelSchemaReleaseIds.every((id) => boundedNonEmpty(id, 240))
  );
}

function publicationObject(value: unknown): boolean {
  return isObject(value) && Object.values(value).every(publicationValue);
}

function publicationValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(publicationValue);
  return publicationObject(value);
}

function isWorldPlacementSource(
  value: unknown,
): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  if (value.kind === "world-creature") {
    return (
      onlyKeys(value, ["kind", "creatureId"]) &&
      boundedNonEmpty(value.creatureId, 240)
    );
  }
  if (value.kind === "world-item") {
    return (
      onlyKeys(value, ["kind", "itemDefinitionId"]) &&
      boundedNonEmpty(value.itemDefinitionId, 240)
    );
  }
  return (
    value.kind === "registered-content" &&
    onlyKeys(value, ["kind", "definitionId"]) &&
    boundedNonEmpty(value.definitionId, 240)
  );
}

function worldPlacementSourceExists(
  source: Record<string, unknown>,
  definitions: ReadonlyMap<string, unknown>,
  legacyCreatures: ReadonlySet<string>,
): boolean {
  if (source.kind === "world-creature") {
    const id = source.creatureId as string;
    const definition = definitions.get(id);
    return definition === undefined
      ? legacyCreatures.has(id)
      : isObject(definition) && definition.kind === "creature";
  }
  if (source.kind === "world-item") {
    const definition = definitions.get(source.itemDefinitionId as string);
    return isObject(definition) && definition.kind === "item";
  }
  return definitions.has(source.definitionId as string);
}

function normalizedCoordinate(value: unknown): boolean {
  return (
    isObject(value) &&
    onlyKeys(value, ["kind", "x", "y"]) &&
    value.kind === "normalized-map" &&
    finite(value.x) &&
    value.x >= 0 &&
    value.x <= 1 &&
    finite(value.y) &&
    value.y >= 0 &&
    value.y <= 1
  );
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedNonEmpty(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const known = new Set(allowed);
  return Object.keys(value).every((key) => known.has(key));
}

function validateLocationGraph(
  ids: readonly string[],
  byId: ReadonlyMap<string, WorldDraftRecordDto>,
  add: (c: string, s: string, d: string) => void,
) {
  const parents = new Map<string, string>();
  const known = new Set(ids);
  for (const id of ids) {
    const record = byId.get(`locations\0${id}`);
    if (!record || !isObject(record.payload)) continue;
    const placement = record.payload.placement;
    if (
      isObject(placement) &&
      placement.kind === "within-parent" &&
      typeof placement.parentLocationId === "string"
    ) {
      if (!known.has(placement.parentLocationId))
        add(
          "location-parent-missing",
          recordName(record),
          "The parent Location is not in this World capture.",
        );
      parents.set(id, placement.parentLocationId);
    }
  }
  for (const id of ids) {
    const seen = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor) {
      if (seen.has(cursor)) {
        add(
          "location-cycle",
          recordName(byId.get(`locations\0${id}`)),
          "The Location hierarchy contains a cycle.",
        );
        break;
      }
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
  }
}

function stringArray(
  value: Record<string, unknown>,
  field: string,
  add: (c: string, s: string, d: string) => void,
  optional = false,
): string[] {
  const raw = value[field];
  if (optional && raw === undefined) return [];
  if (
    !Array.isArray(raw) ||
    raw.some((item) => typeof item !== "string" || !item.trim())
  ) {
    add(
      "collection-invalid",
      "World draft",
      `${field} must be a collection of stable references.`,
    );
    return [];
  }
  if (new Set(raw).size !== raw.length)
    add(
      "collection-duplicate",
      "World draft",
      `${field} contains a duplicate reference.`,
    );
  return raw as string[];
}

function requireRecord(
  byId: ReadonlyMap<string, WorldDraftRecordDto>,
  resource: string,
  id: string,
  label: string,
  add: (c: string, s: string, d: string) => void,
) {
  if (!byId.has(`${resource}\0${id}`))
    add(
      "declared-record-missing",
      "World draft",
      `A declared ${label} is missing from the capture.`,
    );
}
function stringField(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const raw = value[field];
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function recordName(record?: WorldDraftRecordDto): string {
  if (record && isObject(record.payload)) {
    const name = record.payload.name;
    if (typeof name === "string" && name.trim()) return name.trim();
    const identity = record.payload.identity;
    if (
      isObject(identity) &&
      typeof identity.name === "string" &&
      identity.name.trim()
    )
      return identity.name.trim();
  }
  return "World resource";
}
