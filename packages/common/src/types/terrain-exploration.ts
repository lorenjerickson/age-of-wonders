import type { TerrainPoint } from "./isometric-terrain";
import type { NamespacedKey } from "./primitives";

/** Server-selected scope. Snapshot adoption starts a separate exploration history. */
export interface TerrainObservationContext {
  readonly campaignInstanceId: string;
  readonly snapshotId: string;
  readonly locationId: string;
  readonly observerId: string;
  readonly runtimeRevision: number;
}

/** A disclosed triangle, including the material revision actually seen at that time. */
export interface TerrainExploredSurface {
  readonly key: string;
  readonly material: { readonly key: NamespacedKey; readonly revision: number };
  readonly treatment: "terrain" | "glass";
  readonly triangle: readonly [TerrainPoint, TerrainPoint, TerrainPoint];
}

/** Internal observation produced only after server visibility evaluation and redaction. */
export interface TerrainExplorationObservation {
  readonly context: TerrainObservationContext;
  readonly surfaces: readonly TerrainExploredSurface[];
  /** Explicitly observed disappearance; absence from the visible set alone never erases memory. */
  readonly absentSurfaceKeys: readonly string[];
}

/** Versioned JSON stored in CampaignTerrainExploration.payload; not an authored World record or player input. */
export interface TerrainExplorationSnapshot {
  readonly formatVersion: 1;
  readonly context: TerrainObservationContext;
  readonly visibleSurfaceKeys: readonly string[];
  readonly surfaces: readonly (TerrainExploredSurface & {
    readonly lastSeenRuntimeRevision: number;
  })[];
}
