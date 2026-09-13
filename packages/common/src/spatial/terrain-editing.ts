import type {
  IsometricTerrainVolume,
  TerrainAddress,
  TerrainCell,
  TerrainCellWrite,
  TerrainChunk,
  TerrainMaterialReference,
  TerrainRegion,
} from "../types/isometric-terrain";
import type { NamespacedKey } from "../types/primitives";
import {
  assertTerrainVolume,
  isTerrainAddress,
  terrainAddressKey,
  terrainCellAddress,
  TERRAIN_MAX_CELLS,
} from "./terrain-validation";

export function createTerrainVolume(
  dimensions: TerrainAddress,
  materials: readonly TerrainMaterialReference[],
): IsometricTerrainVolume {
  const volume: IsometricTerrainVolume = {
    kind: "isometric-terrain",
    formatVersion: 1,
    dimensions: { ...dimensions },
    cellSize: { value: 5, unit: "ft" },
    chunkSize: 16,
    materials: materials.map((material) => ({ ...material })),
    chunks: [],
  };
  assertTerrainVolume(volume);
  return volume;
}

export function terrainCellIndex(
  volume: IsometricTerrainVolume,
): ReadonlyMap<string, TerrainCell> {
  assertTerrainVolume(volume);
  const index = new Map<string, TerrainCell>();
  for (const chunk of volume.chunks)
    for (const cell of chunk.cells)
      index.set(
        terrainAddressKey(terrainCellAddress(chunk.address, cell.offset)),
        cell,
      );
  return index;
}

export function assertTerrainRegion(
  region: TerrainRegion,
  dimensions: TerrainAddress,
): void {
  if (
    !region ||
    !isTerrainAddress(region.minimum, dimensions) ||
    !isTerrainAddress(region.maximum, dimensions) ||
    region.minimum.x > region.maximum.x ||
    region.minimum.y > region.maximum.y ||
    region.minimum.z > region.maximum.z
  )
    throw new TypeError(
      "Choose inclusive region bounds inside the terrain map.",
    );
}

/** Selecting a plane is the special case where one minimum/maximum component is equal. */
export function terrainRegionAddresses(
  region: TerrainRegion,
  dimensions: TerrainAddress,
): readonly TerrainAddress[] {
  assertTerrainRegion(region, dimensions);
  const addresses: TerrainAddress[] = [];
  for (let z = region.minimum.z; z <= region.maximum.z; z++)
    for (let y = region.minimum.y; y <= region.maximum.y; y++)
      for (let x = region.minimum.x; x <= region.maximum.x; x++)
        addresses.push({ x, y, z });
  return addresses;
}

function cellValue(cell: TerrainCell): Omit<TerrainCell, "offset"> {
  return {
    materialKey: cell.materialKey,
    shape: { top: [...cell.shape.top], diagonal: cell.shape.diagonal },
    ...(cell.smoothing === undefined ? {} : { smoothing: cell.smoothing }),
    ...(cell.opening === undefined ? {} : { opening: { ...cell.opening } }),
  };
}

export interface TerrainEditResult {
  readonly volume: IsometricTerrainVolume;
  readonly undo: readonly TerrainCellWrite[];
  readonly redo: readonly TerrainCellWrite[];
}

/** Atomic pure batch: validate the complete result before returning; never mutates the input. */
export function applyTerrainWrites(
  volume: IsometricTerrainVolume,
  writes: readonly TerrainCellWrite[],
): TerrainEditResult {
  assertTerrainVolume(volume);
  if (!Array.isArray(writes) || writes.length > TERRAIN_MAX_CELLS)
    throw new TypeError("A terrain edit exceeds the map volume.");
  const chunks = new Map(
    volume.chunks.map((chunk) => [terrainAddressKey(chunk.address), chunk]),
  );
  const changed = new Map<
    string,
    { address: TerrainAddress; cells: Map<number, TerrainCell> }
  >();
  const seen = new Set<string>();
  const undo: TerrainCellWrite[] = [],
    redo: TerrainCellWrite[] = [];
  for (const write of writes) {
    if (!write || !isTerrainAddress(write.address, volume.dimensions))
      throw new TypeError("A terrain edit is outside the map.");
    const addressKey = terrainAddressKey(write.address);
    if (seen.has(addressKey))
      throw new TypeError("A terrain edit repeats a cell address.");
    seen.add(addressKey);
    const { x, y, z } = write.address;
    const chunkAddress = {
      x: Math.floor(x / 16),
      y: Math.floor(y / 16),
      z: Math.floor(z / 16),
    };
    const chunkKey = terrainAddressKey(chunkAddress);
    let draft = changed.get(chunkKey);
    if (!draft) {
      draft = {
        address: chunkAddress,
        cells: new Map(
          chunks.get(chunkKey)?.cells.map((cell) => [cell.offset, cell]),
        ),
      };
      changed.set(chunkKey, draft);
    }
    const offset = (x % 16) + (y % 16) * 16 + (z % 16) * 256;
    const previous = draft.cells.get(offset);
    // Preserve null semantics; undefined/malformed writes must fail final validation.
    if (write.cell === null && !previous) continue;
    undo.push({
      address: { ...write.address },
      cell: previous ? cellValue(previous) : null,
    });
    if (write.cell === null) {
      draft.cells.delete(offset);
      redo.push({ address: { ...write.address }, cell: null });
    } else {
      const cell = { ...write.cell, offset } as TerrainCell;
      draft.cells.set(offset, cell);
      redo.push({ address: { ...write.address }, cell: write.cell });
    }
  }
  for (const [key, chunk] of changed) {
    if (!chunk.cells.size) chunks.delete(key);
    else
      chunks.set(key, {
        address: chunk.address,
        cells: [...chunk.cells.values()].sort((a, b) => a.offset - b.offset),
      });
  }
  const result: IsometricTerrainVolume = {
    ...volume,
    chunks: [...chunks.values()].sort(
      (a: TerrainChunk, b: TerrainChunk) =>
        a.address.z - b.address.z ||
        a.address.y - b.address.y ||
        a.address.x - b.address.x,
    ),
  };
  assertTerrainVolume(result);
  return { volume: result, undo, redo };
}

/** Exact arbitrary selection. Changing palette entry preserves geometry and opening identity/state. */
export function editTerrainSelection(
  volume: IsometricTerrainVolume,
  selection: readonly TerrainAddress[],
  operation:
    | { readonly kind: "remove" }
    | { readonly kind: "material"; readonly materialKey: NamespacedKey },
): TerrainEditResult {
  const cells = terrainCellIndex(volume);
  if (!Array.isArray(selection) || selection.length > TERRAIN_MAX_CELLS)
    throw new TypeError("The cell selection exceeds the map volume.");
  if (operation.kind !== "remove" && operation.kind !== "material")
    throw new TypeError("Choose a terrain edit operation.");
  if (
    operation.kind === "material" &&
    !volume.materials.some((m) => m.key === operation.materialKey)
  )
    throw new TypeError("Choose an available terrain material.");
  const unique = new Map<string, TerrainAddress>();
  for (const address of selection) {
    if (!isTerrainAddress(address, volume.dimensions))
      throw new TypeError("The selection is outside the map.");
    unique.set(terrainAddressKey(address), address);
  }
  const writes: TerrainCellWrite[] = [];
  for (const [key, address] of unique) {
    const current = cells.get(key);
    if (!current) continue;
    writes.push({
      address,
      cell:
        operation.kind === "remove"
          ? null
          : { ...cellValue(current), materialKey: operation.materialKey },
    });
  }
  return applyTerrainWrites(volume, writes);
}
