import type {
  IsometricTerrainVolume,
  TerrainAddress,
  TerrainCellWrite,
  TerrainGenerationSettings,
  TerrainTopHeights,
} from "../types/isometric-terrain";
import { assertTerrainRegion, terrainCellIndex } from "./terrain-editing";
import {
  isTerrainAddress,
  terrainAddressKey,
  TERRAIN_MAX_CELLS,
} from "./terrain-validation";

/** Version 1 constants are part of deterministic output. Change version when changing this algorithm. */
export const TERRAIN_GENERATION_PRESETS = {
  plains: { relief: 0.2, highFrequency: 0.08 },
  "rolling-hills": { relief: 0.5, highFrequency: 0.16 },
  mountains: { relief: 1, highFrequency: 0.24 },
} as const;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function lattice(seed: number, x: number, y: number): number {
  let hash = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}
function noise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = smooth(x - ix),
    fy = smooth(y - iy);
  return mix(
    mix(lattice(seed, ix, iy), lattice(seed, ix + 1, iy), fx),
    mix(lattice(seed, ix, iy + 1), lattice(seed, ix + 1, iy + 1), fx),
    fy,
  );
}

export interface TerrainGenerationPreview {
  readonly writes: readonly TerrainCellWrite[];
  readonly created: number;
  readonly replaced: number;
  readonly removed: number;
  readonly skipped: number;
}

/**
 * Pure worker-ready candidate generation, not a save or gameplay action. Caller owns cancellation,
 * revision checks and preview/apply. Existing cells outside the region/mask are never written.
 */
export function generateTerrainPreview(
  volume: IsometricTerrainVolume,
  settings: TerrainGenerationSettings,
): TerrainGenerationPreview {
  const existing = terrainCellIndex(volume);
  if (
    !settings ||
    settings.version !== 1 ||
    !Number.isInteger(settings.seed) ||
    settings.seed < 0 ||
    settings.seed > 0xffffffff ||
    !Object.hasOwn(TERRAIN_GENERATION_PRESETS, settings.preset)
  )
    throw new TypeError(
      "Choose a supported terrain generator, preset, and unsigned 32-bit seed.",
    );
  assertTerrainRegion(settings.region, volume.dimensions);
  const { minimum, maximum } = settings.region;
  if (
    ![
      settings.minimumElevation,
      settings.maximumElevation,
      settings.baseElevation,
      settings.featureSize,
      settings.roughness,
    ].every(Number.isFinite) ||
    ![
      settings.minimumElevation,
      settings.maximumElevation,
      settings.baseElevation,
    ].every((h) => Number.isInteger(h * 16)) ||
    settings.minimumElevation < minimum.z ||
    settings.maximumElevation > maximum.z + 1 ||
    settings.minimumElevation > settings.baseElevation ||
    settings.baseElevation > settings.maximumElevation ||
    settings.featureSize < 2 ||
    settings.featureSize > 100 ||
    settings.roughness < 0 ||
    settings.roughness > 1 ||
    !volume.materials.some((m) => m.key === settings.materialKey) ||
    !["fill-empty", "replace-region"].includes(settings.mode)
  )
    throw new TypeError(
      "Terrain generation needs valid elevations, feature size, roughness, material, and mode.",
    );
  let mask: Set<string> | undefined;
  if (settings.mask !== undefined) {
    if (
      !Array.isArray(settings.mask) ||
      settings.mask.length > TERRAIN_MAX_CELLS
    )
      throw new TypeError("The generation selection exceeds the map volume.");
    mask = new Set<string>();
    for (const address of settings.mask) {
      if (
        !isTerrainAddress(address, volume.dimensions) ||
        address.x < minimum.x ||
        address.x > maximum.x ||
        address.y < minimum.y ||
        address.y > maximum.y ||
        address.z < minimum.z ||
        address.z > maximum.z
      )
        throw new TypeError(
          "The generation selection must be inside its region.",
        );
      mask.add(terrainAddressKey(address));
    }
  }
  const preset = TERRAIN_GENERATION_PRESETS[settings.preset];
  const elevation = (x: number, y: number): number => {
    const px = x / settings.featureSize,
      py = y / settings.featureSize;
    const weight = preset.highFrequency * settings.roughness;
    const n =
      (noise(settings.seed, px, py) +
        weight * noise(settings.seed ^ 0x9e3779b9, px * 2, py * 2) +
        weight * weight * noise(settings.seed ^ 0x85ebca6b, px * 4, py * 4)) /
      (1 + weight + weight * weight);
    // Squared magnitude favors elevations near the base; broad extremes are less frequent.
    const weighted = Math.sign(n) * n * n * preset.relief;
    const range =
      weighted >= 0
        ? settings.maximumElevation - settings.baseElevation
        : settings.baseElevation - settings.minimumElevation;
    return clamp(
      Math.round((settings.baseElevation + weighted * range) * 16) / 16,
      settings.minimumElevation,
      settings.maximumElevation,
    );
  };
  const writes: TerrainCellWrite[] = [];
  let created = 0,
    replaced = 0,
    removed = 0,
    skipped = 0;
  for (let y = minimum.y; y <= maximum.y; y++) {
    for (let x = minimum.x; x <= maximum.x; x++) {
      const corners = [
        elevation(x, y),
        elevation(x + 1, y),
        elevation(x + 1, y + 1),
        elevation(x, y + 1),
      ];
      // One supported top block above solid fill. At contour crossings, closed side faces form cliffs;
      // never stack independently clamped wedges, which would create unsupported floating layers.
      const surfaceZ = Math.min(Math.floor(Math.min(...corners)), maximum.z);
      for (let z = minimum.z; z <= maximum.z; z++) {
        const address: TerrainAddress = { x, y, z };
        const key = terrainAddressKey(address);
        if (mask && !mask.has(key)) continue;
        const before = existing.get(key);
        if (before && settings.mode === "fill-empty") {
          skipped++;
          continue;
        }
        const top = corners.map((h) =>
          z < surfaceZ ? 1 : z === surfaceZ ? clamp(h - z, 0, 1) : 0,
        ) as unknown as TerrainTopHeights;
        if (top.some((h) => h > 0)) {
          writes.push({
            address,
            cell: {
              materialKey: settings.materialKey,
              shape: { top, diagonal: "00-11" },
            },
          });
          if (before) replaced++;
          else created++;
        } else if (before && settings.mode === "replace-region") {
          writes.push({ address, cell: null });
          removed++;
        }
      }
    }
  }
  return { writes, created, replaced, removed, skipped };
}
