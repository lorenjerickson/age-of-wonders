import { createHash } from "node:crypto";

export const MAX_SNAPSHOT_RECORDS = 5_000;
export const MAX_PUBLICATION_JSON_DEPTH = 64;

export interface SnapshotRecordInput {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly sourceRevision?: number;
  readonly payload: unknown;
}

export interface CanonicalSnapshotRecord extends SnapshotRecordInput {
  readonly contentHash: string;
}

export interface CanonicalSnapshotManifest {
  readonly formatVersion: number;
  readonly contentHash: string;
  readonly records: readonly CanonicalSnapshotRecord[];
}

export function canonicalJsonHash(value: unknown): string {
  if (!isJsonValue(value, 0)) throw new TypeError("Snapshot content must be bounded JSON.");
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)))
    .digest("hex");
}

export function buildSnapshotManifest(
  formatVersion: number,
  inputs: readonly SnapshotRecordInput[],
): CanonicalSnapshotManifest {
  if (
    !Number.isInteger(formatVersion) ||
    formatVersion < 1 ||
    inputs.length < 1 ||
    inputs.length > MAX_SNAPSHOT_RECORDS
  ) {
    throw new TypeError("A snapshot manifest requires a supported format and records.");
  }
  const records = inputs.map((input) => {
    const resourceType = input.resourceType.trim();
    const sourceId = input.sourceId.trim();
    if (
      !resourceType ||
      !sourceId ||
      (input.sourceRevision !== undefined &&
        (!Number.isInteger(input.sourceRevision) || input.sourceRevision < 1))
    ) {
      throw new TypeError("A snapshot record is incomplete.");
    }
    return {
      resourceType,
      sourceId,
      ...(input.sourceRevision === undefined
        ? {}
        : { sourceRevision: input.sourceRevision }),
      contentHash: canonicalJsonHash(input.payload),
      payload: input.payload,
    };
  });
  const withoutHash = { formatVersion, records };
  return { ...withoutHash, contentHash: canonicalJsonHash(withoutHash) };
}

export function isCanonicalSnapshotManifest(
  value: unknown,
): value is CanonicalSnapshotManifest {
  if (!isObject(value) || !Array.isArray(value.records)) return false;
  try {
    const rebuilt = buildSnapshotManifest(
      Number(value.formatVersion),
      value.records.map((record) => {
        if (!isObject(record)) throw new TypeError("Invalid snapshot record.");
        if (
          typeof record.resourceType !== "string" ||
          typeof record.sourceId !== "string"
        ) {
          throw new TypeError("Invalid snapshot record.");
        }
        return {
          resourceType: record.resourceType,
          sourceId: record.sourceId,
          ...(record.sourceRevision === undefined
            ? {}
            : { sourceRevision: Number(record.sourceRevision) }),
          payload: record.payload,
        };
      }),
    );
    return (
      value.contentHash === rebuilt.contentHash &&
      value.records.every(
        (record, index) =>
          isObject(record) &&
          record.contentHash === rebuilt.records[index]?.contentHash,
      )
    );
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPublicationJson(value: unknown): boolean {
  return isJsonValue(value, 0);
}

function isJsonValue(value: unknown, depth: number): boolean {
  if (depth > MAX_PUBLICATION_JSON_DEPTH) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return value.every((child) => isJsonValue(child, depth + 1));
  return (
    isObject(value) &&
    Object.values(value).every((child) => isJsonValue(child, depth + 1))
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}
