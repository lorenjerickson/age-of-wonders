import {
  terrainCellIndex,
  terrainSupportHeight,
  type IsometricTerrainVolume,
  type TerrainPoint,
} from "@aow/common";

export interface SessionViewportActor {
  readonly id: string;
  readonly name: string;
  /** Exact foot coordinates in captured terrain grid units, without an editor-cell offset. */
  readonly position: TerrainPoint;
}
export interface SessionViewportInteraction {
  readonly actors: readonly SessionViewportActor[];
  readonly focusedActorId: string;
  readonly pendingDestination?: TerrainPoint;
  readonly interactionDisabled?: boolean;
  onActorSelect(id: string): void;
  /** Candidate declaration only; the viewport never moves an actor or evaluates gameplay Rules. */
  onDestinationPick(point: TerrainPoint): void;
}

export function sessionClickWasDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return Math.hypot(end.x - start.x, end.y - start.y) > 6;
}

export function terrainViewportFocus(
  editorActor: TerrainPoint,
  sessionActor?: TerrainPoint,
): TerrainPoint {
  return sessionActor
    ? { x: sessionActor.x, y: sessionActor.y, z: sessionActor.z + 1 }
    : { x: editorActor.x + 0.5, y: editorActor.y + 0.5, z: editorActor.z + 1 };
}

/** Raycast hits are visual candidates. Resolve exact authored support height instead of persisting float32 mesh error. */
export function createSessionSurfacePicker(volume: IsometricTerrainVolume) {
  const cells = terrainCellIndex(volume);
  return (
    hits: readonly { point: TerrainPoint; normalZ: number }[],
  ): TerrainPoint[] => {
    const supports: TerrainPoint[] = [];
    for (const hit of hits) {
      const { x, y, z } = hit.point;
      if (
        hit.normalZ <= 1e-6 ||
        ![x, y, z].every(Number.isFinite) ||
        x < 0 ||
        y < 0 ||
        z < -1e-5 ||
        x >= volume.dimensions.x ||
        y >= volume.dimensions.y ||
        z > volume.dimensions.z + 1e-5
      )
        continue;
      const cellX = Math.floor(x),
        cellY = Math.floor(y);
      for (const cellZ of new Set([Math.floor(z), Math.floor(z) - 1])) {
        const cell = cells.get(`${cellX},${cellY},${cellZ}`);
        if (!cell || cell.opening) continue;
        const height =
          cellZ + terrainSupportHeight(cell.shape, x - cellX, y - cellY);
        if (
          Math.abs(height - z) > 1e-5 ||
          height < 0 ||
          height > volume.dimensions.z
        )
          continue;
        const point = { x, y, z: height };
        if (
          !supports.some(
            (p) => Math.hypot(p.x - x, p.y - y, p.z - height) < 1e-5,
          )
        )
          supports.push(point);
        break;
      }
      if (supports.length >= 8) break;
    }
    return supports;
  };
}
