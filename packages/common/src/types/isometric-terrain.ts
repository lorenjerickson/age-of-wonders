import type { NamespacedKey } from "./primitives";

/** Integer address for cells/chunks/dimensions; X/Y horizontal, Z up. */
export interface TerrainAddress {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Continuous map-local position in grid units; never normalized image coordinates. */
export interface TerrainPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type TerrainTopHeights = readonly [number, number, number, number];
export type TerrainTopDiagonal = "00-11" | "10-01";
export type TerrainShapePreset = "cube" | "ramp" | "ridge" | "valley";

/** Upper corners ordered 00, 10, 11, 01; heights quantized to sixteenths of a cell. */
export interface TerrainShape {
  readonly top: TerrainTopHeights;
  readonly diagonal: TerrainTopDiagonal;
}

/** Frame is retained in every state. Dimensions are fractions of the unit cell. */
export type TerrainOpening = {
  readonly id: string;
  readonly facing: 0 | 1 | 2 | 3;
  readonly frameThickness: number;
} & (
  | { readonly kind: "door"; readonly state: "open" | "closed" | "locked" }
  | { readonly kind: "window"; readonly state: "open" | "closed" }
);

/** Palette identity/version, not the texture asset contract or a media URL. */
export interface TerrainMaterialReference {
  readonly key: NamespacedKey;
  readonly revision: number;
  readonly name: string;
  readonly terrainType: NamespacedKey;
}

export interface TerrainCell {
  /** Local offset = x + 16*y + 256*z, in the owning chunk. */
  readonly offset: number;
  readonly materialKey: NamespacedKey;
  readonly shape: TerrainShape;
  /** Visual-only smoothing strength; omitted means zero. */
  readonly smoothing?: number;
  readonly opening?: TerrainOpening;
}

export interface TerrainChunk {
  readonly address: TerrainAddress;
  /** Sparse occupied cells. Empty chunks are omitted. */
  readonly cells: readonly TerrainCell[];
}

/**
 * Hydrated authoring value. Location persistence uses an IsometricTerrainManifest
 * with content-addressed chunk components in the captured World snapshot.
 */
export interface IsometricTerrainVolume {
  readonly kind: "isometric-terrain";
  readonly formatVersion: 1;
  readonly dimensions: TerrainAddress;
  readonly cellSize: { readonly value: 5; readonly unit: "ft" };
  readonly chunkSize: 16;
  readonly materials: readonly TerrainMaterialReference[];
  readonly chunks: readonly TerrainChunk[];
}

export interface TerrainCellWrite {
  readonly address: TerrainAddress;
  /** Null erases exactly this address. */
  readonly cell: Omit<TerrainCell, "offset"> | null;
}

/** Inclusive bounds, in cell addresses. */
export interface TerrainRegion {
  readonly minimum: TerrainAddress;
  readonly maximum: TerrainAddress;
}

export interface TerrainGenerationSettings {
  readonly version: 1;
  readonly seed: number;
  readonly preset: "plains" | "rolling-hills" | "mountains";
  readonly region: TerrainRegion;
  /** Surface elevations in grid units, including the upper map boundary. */
  readonly minimumElevation: number;
  readonly maximumElevation: number;
  readonly baseElevation: number;
  /** Size of broad landforms in cells, 2..100. */
  readonly featureSize: number;
  readonly roughness: number;
  readonly materialKey: NamespacedKey;
  readonly mode: "fill-empty" | "replace-region";
  /** If present, these exact addresses are the only writable cells (including air). */
  readonly mask?: readonly TerrainAddress[];
}

/** Location-owned map selection; image metadata remains on the Location. */
export type LocationMap = { readonly kind: "image" } | IsometricTerrainManifest;

/** Captured chunks are addressed by their canonical SHA-256 payload hash. */
export interface IsometricTerrainManifest {
  readonly kind: "isometric";
  readonly formatVersion: 1;
  readonly dimensions: TerrainAddress;
  readonly cellSize: { readonly value: 5; readonly unit: "ft" };
  readonly chunkSize: 16;
  readonly materials: readonly TerrainMaterialReference[];
  readonly chunks: readonly {
    readonly address: TerrainAddress;
    readonly contentHash: string;
  }[];
}

export interface SaveLocationTerrainRequest {
  readonly expectedDraftId: string;
  readonly expectedStorageRevision: number;
  readonly operationId: string;
  readonly map: LocationMap;
}
