import type {
  IsometricTerrainVolume,
  TerrainAddress,
  TerrainShape,
} from "../types/isometric-terrain";

export const TERRAIN_CHUNK_SIZE = 16;
export const TERRAIN_MAX_EDGE = 100;
export const TERRAIN_MAX_CELLS = 1_000_000;

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const label = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 200;
const key = (v: unknown): v is string =>
  label(v) && /^[^\s:]+:[^\s:]+$/.test(v);

export function terrainAddressKey(address: TerrainAddress): string {
  return `${address.x},${address.y},${address.z}`;
}

export function isTerrainAddress(
  value: unknown,
  dimensions: TerrainAddress,
): value is TerrainAddress {
  return (
    object(dimensions) &&
    integer(dimensions.x, 1, 100) &&
    integer(dimensions.y, 1, 100) &&
    integer(dimensions.z, 1, 100) &&
    object(value) &&
    integer(value.x, 0, dimensions.x - 1) &&
    integer(value.y, 0, dimensions.y - 1) &&
    integer(value.z, 0, dimensions.z - 1)
  );
}

export function isTerrainShape(value: unknown): value is TerrainShape {
  return (
    object(value) &&
    Array.isArray(value.top) &&
    value.top.length === 4 &&
    Array.from(value.top).every(
      (h: unknown) => finite(h, 0, 1) && Number.isInteger(h * 16),
    ) &&
    value.top.some((h: number) => h > 0) &&
    (value.diagonal === "00-11" || value.diagonal === "10-01")
  );
}

export function terrainCellAddress(
  chunk: TerrainAddress,
  offset: number,
): TerrainAddress {
  return {
    x: chunk.x * 16 + (offset % 16),
    y: chunk.y * 16 + (Math.floor(offset / 16) % 16),
    z: chunk.z * 16 + Math.floor(offset / 256),
  };
}

/** Returns a human-readable issue without echoing opaque keys or submitted values. */
export function terrainVolumeIssue(value: unknown): string | undefined {
  if (
    !object(value) ||
    value.kind !== "isometric-terrain" ||
    value.formatVersion !== 1 ||
    value.chunkSize !== 16
  )
    return "Terrain requires a supported format and chunk size.";
  const d = value.dimensions;
  if (
    !object(d) ||
    !integer(d.x, 1, 100) ||
    !integer(d.y, 1, 100) ||
    !integer(d.z, 1, 100)
  )
    return "Terrain dimensions must be whole cell counts from 1 to 100.";
  const dimensions = { x: d.x, y: d.y, z: d.z };
  if (
    !object(value.cellSize) ||
    value.cellSize.value !== 5 ||
    value.cellSize.unit !== "ft"
  )
    return "Terrain cells must have a five-foot edge.";
  if (
    !Array.isArray(value.materials) ||
    value.materials.length < 1 ||
    value.materials.length > 256
  )
    return "Terrain requires between one and 256 materials.";
  const materials = new Set<string>();
  for (const m of value.materials) {
    if (
      !object(m) ||
      !key(m.key) ||
      !key(m.terrainType) ||
      !label(m.name) ||
      !integer(m.revision, 1, Number.MAX_SAFE_INTEGER) ||
      materials.has(m.key)
    )
      return "Terrain materials need unique keys, names, terrain types, and positive revisions.";
    materials.add(m.key);
  }
  const chunkDimensions = {
    x: Math.ceil(d.x / 16),
    y: Math.ceil(d.y / 16),
    z: Math.ceil(d.z / 16),
  };
  if (
    !Array.isArray(value.chunks) ||
    value.chunks.length >
      chunkDimensions.x * chunkDimensions.y * chunkDimensions.z
  )
    return "Terrain chunks exceed the map bounds.";
  const chunks = new Set<string>();
  const openings = new Set<string>();
  for (const chunk of value.chunks) {
    if (!object(chunk) || !isTerrainAddress(chunk.address, chunkDimensions))
      return "A terrain chunk is outside the map.";
    const chunkKey = terrainAddressKey(chunk.address);
    if (chunks.has(chunkKey))
      return "Terrain chunks must have unique addresses.";
    chunks.add(chunkKey);
    if (
      !Array.isArray(chunk.cells) ||
      chunk.cells.length < 1 ||
      chunk.cells.length > 4096
    )
      return "Empty terrain chunks must be omitted; occupied chunks hold at most 4096 cells.";
    const offsets = new Set<number>();
    for (const cell of chunk.cells) {
      if (
        !object(cell) ||
        !integer(cell.offset, 0, 4095) ||
        offsets.has(cell.offset) ||
        !isTerrainAddress(
          terrainCellAddress(chunk.address, cell.offset),
          dimensions,
        )
      )
        return "Terrain cells must have unique addresses inside the map.";
      offsets.add(cell.offset);
      if (
        typeof cell.materialKey !== "string" ||
        !materials.has(cell.materialKey)
      )
        return "A terrain cell references an unavailable material.";
      if (!isTerrainShape(cell.shape))
        return "Terrain shapes require four quantized heights, nonzero volume, and a top diagonal.";
      if (cell.smoothing !== undefined && !finite(cell.smoothing, 0, 1))
        return "Terrain smoothing must be between zero and one.";
      if (cell.opening !== undefined) {
        const o = cell.opening;
        if (
          !object(o) ||
          !label(o.id) ||
          openings.has(o.id) ||
          !integer(o.facing, 0, 3) ||
          !finite(o.frameThickness, 1 / 16, 7 / 16) ||
          typeof o.state !== "string" ||
          !(o.kind === "door"
            ? ["open", "closed", "locked"].includes(String(o.state))
            : o.kind === "window" &&
              ["open", "closed"].includes(String(o.state)))
        )
          return "An opening requires a unique identity, valid frame, orientation, and state.";
        if (cell.shape.top.some((h) => h !== 1) || (cell.smoothing ?? 0) !== 0)
          return "Doors and windows require unsmoothed cube cells.";
        openings.add(o.id);
      }
    }
  }
  return undefined;
}

export function assertTerrainVolume(
  value: unknown,
): asserts value is IsometricTerrainVolume {
  const issue = terrainVolumeIssue(value);
  if (issue) throw new TypeError(issue);
}

/** Structural validation only; server must also resolve and validate every captured chunk. */
export function locationMapIssue(value: unknown): string | undefined {
  if (!object(value)) return "Choose a valid Location map.";
  if (value.kind === "image") return undefined;
  if (value.kind !== "isometric")
    return "Choose a supported Location map kind.";
  const issue = terrainVolumeIssue({
    ...value,
    kind: "isometric-terrain",
    chunks: [],
  });
  if (issue) return issue;
  const dimensions = value.dimensions as unknown as TerrainAddress;
  const chunkDimensions = {
    x: Math.ceil(dimensions.x / 16),
    y: Math.ceil(dimensions.y / 16),
    z: Math.ceil(dimensions.z / 16),
  };
  if (
    !Array.isArray(value.chunks) ||
    value.chunks.length >
      chunkDimensions.x * chunkDimensions.y * chunkDimensions.z
  )
    return "Terrain chunk references exceed the map bounds.";
  const addresses = new Set<string>();
  for (const ref of value.chunks) {
    if (
      !object(ref) ||
      !isTerrainAddress(ref.address, chunkDimensions) ||
      typeof ref.contentHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(ref.contentHash)
    )
      return "A terrain chunk reference is invalid.";
    const key = terrainAddressKey(ref.address);
    if (addresses.has(key))
      return "Terrain chunk references must have unique addresses.";
    addresses.add(key);
  }
  return undefined;
}
