import type {
  IsometricTerrainVolume,
  TerrainPoint,
} from "../types/isometric-terrain";
import { terrainSupportHeight } from "./terrain-geometry";

/** Finite feet position in map grid units. */
export function isTerrainActorPosition(value: unknown): value is TerrainPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return (
    Object.keys(point).length === 3 &&
    ["x", "y", "z"].every((axis) => {
      const n = point[axis];
      return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
    })
  );
}

/** Setup validation only; body clearance and movement remain rule decisions. */
export function terrainActorPositionIssue(
  volume: IsometricTerrainVolume,
  point: TerrainPoint,
): string | undefined {
  if (
    !isTerrainActorPosition(point) ||
    point.x >= volume.dimensions.x ||
    point.y >= volume.dimensions.y ||
    point.z > volume.dimensions.z
  )
    return "Place the actor inside this map using finite grid coordinates.";
  const x = Math.floor(point.x),
    y = Math.floor(point.y);
  for (const z of new Set([Math.floor(point.z), Math.floor(point.z) - 1])) {
    const chunk = volume.chunks.find(
      (c) =>
        c.address.x === Math.floor(x / 16) &&
        c.address.y === Math.floor(y / 16) &&
        c.address.z === Math.floor(z / 16),
    );
    const cell = chunk?.cells.find(
      (c) => c.offset === (x % 16) + 16 * (y % 16) + 256 * (z % 16),
    );
    if (
      cell &&
      !cell.opening &&
      Math.abs(
        z +
          terrainSupportHeight(cell.shape, point.x - x, point.y - y) -
          point.z,
      ) < 1e-8
    )
      return;
  }
  return "Place the actor's feet on an authored terrain surface.";
}
