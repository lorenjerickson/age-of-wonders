import type {
  TerrainPoint,
  TerrainShape,
  TerrainShapePreset,
  TerrainTopHeights,
} from "../types/isometric-terrain";
import { isTerrainShape } from "./terrain-validation";

export type TerrainTriangle = readonly [
  TerrainPoint,
  TerrainPoint,
  TerrainPoint,
];

export function terrainShapePreset(
  preset: TerrainShapePreset,
  quarterTurns = 0,
): TerrainShape {
  if (
    !["cube", "ramp", "ridge", "valley"].includes(preset) ||
    !Number.isInteger(quarterTurns)
  )
    throw new TypeError(
      "Choose a terrain shape and whole quarter-turn rotation.",
    );
  const top: TerrainTopHeights =
    preset === "cube"
      ? [1, 1, 1, 1]
      : preset === "ramp"
        ? [0, 1, 1, 0]
        : [1, 0, 1, 0];
  const turns = ((quarterTurns % 4) + 4) % 4;
  const rotated = top.map(
    (_, i) => top[(i - turns + 4) % 4],
  ) as unknown as TerrainTopHeights;
  const highDiagonal = (preset !== "valley") !== (turns % 2 === 1);
  return { top: rotated, diagonal: highDiagonal ? "00-11" : "10-01" };
}

function requireShape(shape: TerrainShape): void {
  if (!isTerrainShape(shape)) throw new TypeError("Invalid terrain shape.");
}

/** Geometry fact only. Movement costs and exemptions are supplied by captured rules. */
export function isDifficultTerrainShape(shape: TerrainShape): boolean {
  requireShape(shape);
  return shape.top.some((h) => h !== shape.top[0]);
}

export function terrainTopTriangles(
  shape: TerrainShape,
): readonly TerrainTriangle[] {
  requireShape(shape);
  const p = shape.top.map((z, i) => ({
    x: i === 1 || i === 2 ? 1 : 0,
    y: i >= 2 ? 1 : 0,
    z,
  }));
  return shape.diagonal === "00-11"
    ? [
        [p[0], p[1], p[2]],
        [p[0], p[2], p[3]],
      ]
    : [
        [p[0], p[1], p[3]],
        [p[1], p[2], p[3]],
      ];
}

const subtract = (a: TerrainPoint, b: TerrainPoint): TerrainPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const cross = (a: TerrainPoint, b: TerrainPoint): TerrainPoint => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: TerrainPoint, b: TerrainPoint): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

/** Closed canonical solid with outward winding; collapsed faces are omitted. Not opening geometry. */
export function terrainSolidTriangles(
  shape: TerrainShape,
): readonly TerrainTriangle[] {
  const top = terrainTopTriangles(shape);
  const b = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
  ];
  const t = b.map((p, i) => ({ ...p, z: shape.top[i] }));
  const triangles: TerrainTriangle[] = [
    ...top,
    [b[0], b[2], b[1]],
    [b[0], b[3], b[2]],
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    triangles.push([b[i], b[j], t[j]], [b[i], t[j], t[i]]);
  }
  return triangles.filter(([a, b, c]) => {
    const normal = cross(subtract(b, a), subtract(c, a));
    return dot(normal, normal) > 1e-20;
  });
}

/** Exact top support height at a local XY point. Independent of camera and smoothing. */
export function terrainSupportHeight(
  shape: TerrainShape,
  x: number,
  y: number,
): number {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  )
    throw new TypeError("Support coordinates must be inside the cell.");
  for (const [a, b, c] of terrainTopTriangles(shape)) {
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
    const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
    if (u >= -1e-10 && v >= -1e-10 && u + v <= 1 + 1e-10)
      return u * a.z + v * b.z + (1 - u - v) * c.z;
  }
  throw new TypeError("No terrain support at this coordinate.");
}

/** Double-sided ray query. Returns grid-unit distance, independent of direction magnitude. */
export function intersectTerrainShape(
  shape: TerrainShape,
  origin: TerrainPoint,
  direction: TerrainPoint,
): number | undefined {
  if (
    ![
      origin.x,
      origin.y,
      origin.z,
      direction.x,
      direction.y,
      direction.z,
    ].every(Number.isFinite)
  )
    throw new TypeError("Terrain rays require finite coordinates.");
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length === 0)
    throw new TypeError("A terrain ray requires a nonzero direction.");
  const d = {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
  let nearest: number | undefined;
  for (const [a, b, c] of terrainSolidTriangles(shape)) {
    const e1 = subtract(b, a),
      e2 = subtract(c, a),
      p = cross(d, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-10) continue;
    const t = subtract(origin, a),
      u = dot(t, p) / det;
    if (u < -1e-10 || u > 1 + 1e-10) continue;
    const q = cross(t, e1),
      v = dot(d, q) / det;
    if (v < -1e-10 || u + v > 1 + 1e-10) continue;
    const distance = dot(e2, q) / det;
    if (distance >= 0 && (nearest === undefined || distance < nearest))
      nearest = distance;
  }
  return nearest;
}
