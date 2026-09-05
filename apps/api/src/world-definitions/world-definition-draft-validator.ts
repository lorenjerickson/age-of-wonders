import { isPublicationJson } from "../domain/snapshot-manifest";
import type { WorldDraftRecordDto } from "./dto/world-definition-authoring.dto";

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
    if (ids.has(key))
      add(
        "duplicate-record",
        subject,
        "The same captured resource appears more than once.",
      );
    ids.add(key);
    byId.set(
      `${record.resourceType.trim()}\0${record.sourceId.trim()}`,
      record,
    );
  }
  const root = stringField(content, "rootLocationId");
  const locations = stringArray(content, "locationIds", add);
  const definitions = stringArray(content, "definitionIds", add);
  const schemas = stringArray(content, "schemaDefinitionIds", add);
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
  for (const id of definitions)
    requireRecord(byId, "definitions", id, "Definition", add);
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
  validateLocationGraph(locations, byId, add);
  issues.sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject),
  );
  return { valid: issues.length === 0, issues };
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
