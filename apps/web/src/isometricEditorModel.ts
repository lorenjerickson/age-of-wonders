import { Map as DomainMap } from "@aow/domain";
import {
  terrainAddressKey,
  terrainCellAddress,
  terrainSupportHeight,
  terrainCellIndex,
  terrainRegionAddresses,
  type IsometricTerrainVolume,
  type TerrainAddress,
  type TerrainCellWrite,
  type TerrainShape,
  type TerrainOpening,
  type NamespacedKey,
} from "@aow/common";

export const TERRAIN_PALETTE = [
  ["grass", "Grass", "#709552"],
  ["dirt", "Dirt", "#997856"],
  ["sand", "Sand", "#d9c290"],
  ["rock", "Rock", "#869097"],
  ["wood", "Wood", "#ad8252"],
  ["stone", "Stone wall", "#b2b8b6"],
  ["water", "Water", "#448fba"],
].map(([key, name, color]) => ({
  key: `terrain:${key}` as NamespacedKey,
  terrainType: `terrain:${key}` as NamespacedKey,
  name,
  color,
  revision: 1,
}));

export type TerrainWorkPlane = "xy" | "xz" | "yz";
export const terrainPlaneAxis = (plane: TerrainWorkPlane) =>
  plane === "xy" ? "z" : plane === "xz" ? "y" : "x";

export function planeSelection(
  start: TerrainAddress,
  end: TerrainAddress,
  dimensions: TerrainAddress,
  plane: TerrainWorkPlane = "xy",
) {
  const axis = terrainPlaneAxis(plane);
  if (start[axis] !== end[axis])
    throw new TypeError("Keep the work level fixed during a stroke.");
  return terrainRegionAddresses(
    {
      minimum: {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        z: Math.min(start.z, end.z),
      },
      maximum: {
        x: Math.max(start.x, end.x),
        y: Math.max(start.y, end.y),
        z: Math.max(start.z, end.z),
      },
    },
    dimensions,
  );
}

export function terrainPlacementWrites(
  volume: IsometricTerrainVolume,
  selection: readonly TerrainAddress[],
  materialKey: NamespacedKey,
  shape: TerrainShape,
): TerrainCellWrite[] {
  const existing = terrainCellIndex(volume);
  return selection
    .filter((address) => !existing.has(terrainAddressKey(address)))
    .map((address) => ({ address, cell: { materialKey, shape } }));
}

export function mergeTerrainSelection(
  current: readonly TerrainAddress[],
  next: readonly TerrainAddress[],
  mode: "replace" | "add" | "subtract",
) {
  const selected = new Map(
    (mode === "replace" ? [] : current).map((address) => [
      terrainAddressKey(address),
      address,
    ]),
  );
  for (const address of next) {
    if (mode === "subtract") selected.delete(terrainAddressKey(address));
    else selected.set(terrainAddressKey(address), address);
  }
  return [...selected.values()];
}

/** Place the editor proxy on the highest authored surface at its horizontal cell. */
export function terrainPreviewActor(
  volume: IsometricTerrainVolume,
  x: number,
  y: number,
) {
  let z = 0;
  for (const chunk of volume.chunks) {
    if (
      chunk.address.x !== Math.floor(x / 16) ||
      chunk.address.y !== Math.floor(y / 16)
    )
      continue;
    for (const cell of chunk.cells) {
      const address = terrainCellAddress(chunk.address, cell.offset);
      if (address.x === x && address.y === y)
        z = Math.max(z, address.z + terrainSupportHeight(cell.shape, 0.5, 0.5));
    }
  }
  return { x, y, z };
}

export type OpeningSettings = TerrainOpening extends infer O
  ? O extends TerrainOpening
    ? Omit<O, "id">
    : never
  : never;

/** The Map owner validates opening compatibility and the complete candidate. */
export function terrainOpeningWrites(
  volume: IsometricTerrainVolume,
  selection: readonly TerrainAddress[],
  settings: OpeningSettings | null,
  newId: () => string = () => crypto.randomUUID(),
): TerrainCellWrite[] {
  return DomainMap.openingWrites(volume, selection, settings, newId);
}

export function terrainSmoothingWrites(
  volume: IsometricTerrainVolume,
  selection: readonly TerrainAddress[],
  strength: number,
): TerrainCellWrite[] {
  return DomainMap.smoothingWrites(volume, selection, strength);
}
