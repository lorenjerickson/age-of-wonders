import { BadRequestException } from "@nestjs/common";
import {
  locationMapIssue,
  terrainVolumeIssue,
  type IsometricTerrainManifest,
  type IsometricTerrainVolume,
  type TerrainChunk,
} from "@aow/common";
import {
  canonicalJsonHash,
  isPublicationJson,
  MAX_SNAPSHOT_RECORDS,
  type SnapshotRecordInput,
} from "../domain/snapshot-manifest";

/** Snapshot component, intentionally not a generic DomainRecord CRUD resource. */
export const TERRAIN_CHUNK_RESOURCE = "location-terrain-chunks";
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validateUploadedTerrainChunk(value: unknown): TerrainChunk {
  if (
    !isPublicationJson(value) ||
    !isRecord(value) ||
    !Array.isArray(value.cells)
  )
    throw new BadRequestException("Choose a valid terrain chunk.");
  const keys = [
    ...new Set(
      value.cells.map((cell) =>
        isRecord(cell) ? cell.materialKey : undefined,
      ),
    ),
  ];
  const issue = terrainVolumeIssue({
    kind: "isometric-terrain",
    formatVersion: 1,
    dimensions: { x: 100, y: 100, z: 100 },
    cellSize: { value: 5, unit: "ft" },
    chunkSize: 16,
    materials: keys.map((key) => ({
      key,
      terrainType: key,
      revision: 1,
      name: "Terrain",
    })),
    chunks: [value],
  });
  if (issue) throw new BadRequestException(issue);
  // Canonical ordering makes repeated uploads independent of incidental editor order.
  return {
    address: value.address as unknown as TerrainChunk["address"],
    cells: [...(value.cells as TerrainChunk["cells"])].sort(
      (a, b) => a.offset - b.offset,
    ),
  };
}

export function resolveTerrainManifest(
  map: IsometricTerrainManifest,
  records: readonly SnapshotRecordInput[],
): IsometricTerrainVolume {
  const issue = locationMapIssue(map);
  if (issue) throw new BadRequestException(issue);
  const available = new Map(
    records
      .filter((r) => r.resourceType === TERRAIN_CHUNK_RESOURCE)
      .map((r) => [r.sourceId, r.payload]),
  );
  const chunks = map.chunks.map((reference) => {
    const chunk = available.get(reference.contentHash);
    if (
      !chunk ||
      canonicalJsonHash(chunk) !== reference.contentHash ||
      !isRecord(chunk) ||
      canonicalJsonHash(chunk.address) !== canonicalJsonHash(reference.address)
    )
      throw new BadRequestException(
        "A referenced terrain chunk is missing or has changed.",
      );
    return chunk as unknown as TerrainChunk;
  });
  const volume: IsometricTerrainVolume = {
    ...map,
    kind: "isometric-terrain",
    chunks,
  };
  const volumeIssue = terrainVolumeIssue(volume);
  if (volumeIssue) throw new BadRequestException(volumeIssue);
  return volume;
}

/** Validate all map references and retain only reachable chunk components in this draft. */
export function captureTerrainRecords(
  records: readonly SnapshotRecordInput[],
): SnapshotRecordInput[] {
  const used = new Set<string>();
  for (const record of records) {
    if (
      record.resourceType !== "locations" ||
      !isRecord(record.payload) ||
      record.payload.map === undefined
    )
      continue;
    const issue = locationMapIssue(record.payload.map);
    if (issue) throw new BadRequestException(issue);
    const map = record.payload.map as
      IsometricTerrainManifest | { kind: "image" };
    if (map.kind !== "isometric") continue;
    resolveTerrainManifest(map, records);
    for (const ref of map.chunks) used.add(ref.contentHash);
  }
  const result = records.filter(
    (r) => r.resourceType !== TERRAIN_CHUNK_RESOURCE || used.has(r.sourceId),
  );
  if (result.length >= MAX_SNAPSHOT_RECORDS)
    throw new BadRequestException(
      "This World has reached its snapshot record capacity.",
    );
  return [...result];
}

export function terrainSnapshotIssue(
  records: readonly SnapshotRecordInput[],
): string | undefined {
  try {
    captureTerrainRecords(records);
    return undefined;
  } catch (error) {
    return error instanceof BadRequestException
      ? error.message
      : "The terrain capture is invalid.";
  }
}
