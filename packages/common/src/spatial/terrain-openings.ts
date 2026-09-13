import {
  terrainShapePreset,
  terrainSolidTriangles,
  type TerrainTriangle,
} from "./terrain-geometry";
import type { TerrainOpening } from "../types/isometric-terrain";

/** Canonical opening surfaces. Transmission is decided by rules, never by the renderer. */
export function terrainOpeningParts(opening: TerrainOpening): {
  frame: TerrainTriangle[];
  panel: TerrainTriangle[];
  glass: TerrainTriangle[];
} {
  const frame: TerrainTriangle[] = [],
    panel: TerrainTriangle[] = [],
    glass: TerrainTriangle[] = [];
  if (
    !opening ||
    !["door", "window"].includes(opening.kind) ||
    !Number.isInteger(opening.facing) ||
    opening.facing < 0 ||
    opening.facing > 3 ||
    !Number.isFinite(opening.frameThickness) ||
    opening.frameThickness < 1 / 16 ||
    opening.frameThickness > 7 / 16 ||
    !(
      opening.kind === "door"
        ? ["open", "closed", "locked"]
        : ["open", "closed"]
    ).includes(opening.state)
  )
    throw new TypeError("Invalid terrain opening.");
  const t = opening.frameThickness;
  function box(
    target: TerrainTriangle[],
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
  ) {
    for (const triangle of terrainSolidTriangles(terrainShapePreset("cube"))) {
      target.push(
        triangle.map((p) => {
          let px = x + p.x * w,
            py = y + p.y * d;
          for (let turn = 0; turn < opening.facing; turn++)
            [px, py] = [1 - py, px];
          return { x: px, y: py, z: z + p.z * h };
        }) as unknown as TerrainTriangle,
      );
    }
  }
  // Jambs and lintel remain even when the panel retracts into its frame.
  box(frame, 0, 0, 0, t, 1, 1);
  box(frame, 1 - t, 0, 0, t, 1, 1);
  box(frame, t, 0, 1 - t, 1 - 2 * t, 1, t);
  if (opening.kind === "window") box(frame, t, 0, 0, 1 - 2 * t, 1, t);
  if (opening.state !== "open") {
    const bottom = opening.kind === "window" ? t : 0;
    box(
      opening.kind === "window" ? glass : panel,
      t,
      0.45,
      bottom,
      1 - 2 * t,
      0.1,
      1 - t - bottom,
    );
    if (opening.kind === "door") {
      // Raised handle and a crossbar distinguish the authored locked state.
      box(panel, 1 - t - 0.06, 0.4, 0.45, 0.04, 0.05, 0.08);
      if (opening.state === "locked")
        box(panel, t / 2, 0.35, 0.6, 1 - t, 0.1, 0.06);
    }
  }
  return { frame, panel, glass };
}

/** Strict interior facts for rays starting inside a frame, panel, or pane. */
export function terrainOpeningInteriorParts(
  opening: TerrainOpening,
  point: { x: number; y: number; z: number },
): readonly ("frame" | "panel" | "glass")[] {
  let { x, y } = point;
  const { z } = point,
    t = opening.frameThickness;
  for (let turn = 0; turn < opening.facing; turn++) [x, y] = [y, 1 - x];
  const inside = (
    a: number,
    b: number,
    c: number,
    w: number,
    d: number,
    h: number,
  ) =>
    x > a + 1e-9 &&
    x < a + w - 1e-9 &&
    y > b + 1e-9 &&
    y < b + d - 1e-9 &&
    z > c + 1e-9 &&
    z < c + h - 1e-9;
  const parts: ("frame" | "panel" | "glass")[] = [];
  if (
    inside(0, 0, 0, t, 1, 1) ||
    inside(1 - t, 0, 0, t, 1, 1) ||
    inside(t, 0, 1 - t, 1 - 2 * t, 1, t) ||
    (opening.kind === "window" && inside(t, 0, 0, 1 - 2 * t, 1, t))
  )
    parts.push("frame");
  if (opening.state !== "open") {
    const bottom = opening.kind === "window" ? t : 0;
    if (inside(t, 0.45, bottom, 1 - 2 * t, 0.1, 1 - t - bottom))
      parts.push(opening.kind === "window" ? "glass" : "panel");
    else if (
      opening.kind === "door" &&
      (inside(1 - t - 0.06, 0.4, 0.45, 0.04, 0.05, 0.08) ||
        (opening.state === "locked" &&
          inside(t / 2, 0.35, 0.6, 1 - t, 0.1, 0.06)))
    )
      parts.push("panel");
  }
  return parts;
}
