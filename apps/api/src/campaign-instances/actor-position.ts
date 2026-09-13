import {
  terrainActorPositionIssue,
  isTerrainActorPosition,
  type IsometricTerrainManifest,
  type IsometricTerrainVolume,
} from "@aow/common";
import { isCanonicalSnapshotManifest } from "../domain/snapshot-manifest";
import {
  isRecord,
  resolveTerrainManifest,
} from "../world-definitions/terrain-snapshot";

export function capturedActorPositionIssue(
  manifest: unknown,
  locationId: unknown,
  position: unknown,
  cache?: Map<string, IsometricTerrainVolume>,
): string | undefined {
  if (
    !isTerrainActorPosition(position) ||
    typeof locationId !== "string" ||
    !isCanonicalSnapshotManifest(manifest)
  )
    return "Choose a captured isometric Location and a valid actor position.";
  const location = manifest.records.find(
    (r) => r.resourceType === "locations" && r.sourceId === locationId,
  );
  const map = isRecord(location?.payload) ? location.payload.map : undefined;
  if (!isRecord(map) || map.kind !== "isometric")
    return "This Location has no captured isometric terrain.";
  try {
    const volume =
      cache?.get(locationId) ??
      resolveTerrainManifest(
        map as unknown as IsometricTerrainManifest,
        manifest.records,
      );
    cache?.set(locationId, volume);
    return terrainActorPositionIssue(volume, position);
  } catch {
    return "The captured terrain could not be validated.";
  }
}
