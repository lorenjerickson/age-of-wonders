import type {
  IsometricTerrainVolume,
  TerrainAddress,
  TerrainCell,
  TerrainPoint,
  NamespacedKey,
} from "../types";
import { assertTerrainVolume, terrainCellAddress } from "./terrain-validation";
import {
  terrainSolidTriangles,
  terrainSupportHeight,
  type TerrainTriangle,
} from "./terrain-geometry";
import {
  terrainOpeningParts,
  terrainOpeningInteriorParts,
} from "./terrain-openings";

export type TerrainSurfacePart = "solid" | "frame" | "panel" | "glass";
export interface TerrainSurface {
  readonly key: string;
  readonly address: TerrainAddress;
  readonly part: TerrainSurfacePart;
  readonly materialKey: NamespacedKey;
  readonly triangle: TerrainTriangle;
}
export interface TerrainSightContact {
  readonly distance: number;
  readonly surface: TerrainSurface;
}
const EPS = 1e-9;
const axes = ["x", "y", "z"] as const;
const sub = (a: TerrainPoint, b: TerrainPoint): TerrainPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: TerrainPoint, b: TerrainPoint) =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: TerrainPoint, b: TerrainPoint): TerrainPoint => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const at = (a: TerrainPoint, d: TerrainPoint, t: number): TerrainPoint => ({
  x: a.x + d.x * t,
  y: a.y + d.y * t,
  z: a.z + d.z * t,
});

/** Inclusive triangle contact. Coplanar grazing is conservative, not silently clear. */
export function terrainTriangleSegmentContact(
  triangle: TerrainTriangle,
  start: TerrainPoint,
  end: TerrainPoint,
): number | undefined {
  const d = sub(end, start),
    n = cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]));
  const size = Math.hypot(n.x, n.y, n.z);
  if (size < EPS) return;
  const denom = dot(n, d),
    plane = dot(n, sub(start, triangle[0]));
  let low = 0,
    high = 1;
  if (Math.abs(denom) > EPS * size) {
    low = high = -plane / denom;
    if (low < -EPS || low > 1 + EPS) return;
  } else if (Math.abs(plane) > EPS * size) return;
  for (let i = 0; i < 3; i++) {
    const edge = sub(triangle[(i + 1) % 3], triangle[i]);
    const a = dot(n, cross(edge, sub(start, triangle[i]))),
      b = dot(n, cross(edge, d));
    if (Math.abs(b) < EPS * size) {
      if (a < -EPS * size) return;
    } else if (b > 0) low = Math.max(low, (-EPS * size - a) / b);
    else high = Math.min(high, (-EPS * size - a) / b);
    if (low > high + EPS) return;
  }
  return Math.max(0, Math.min(1, low));
}

/** Candidate cells traversed by a finite segment. Grid-edge/corner ties visit every touched cell. */
function segmentCells(
  start: TerrainPoint,
  end: TerrainPoint,
  dimensions: TerrainAddress,
): TerrainAddress[] {
  const d = sub(end, start);
  let enter = 0,
    exit = 1;
  for (const axis of axes) {
    if (Math.abs(d[axis]) < EPS) {
      if (start[axis] < 0 || start[axis] > dimensions[axis]) return [];
    } else {
      const a = -start[axis] / d[axis],
        b = (dimensions[axis] - start[axis]) / d[axis];
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
  }
  if (enter > exit + EPS) return [];
  const p = at(start, d, enter),
    cell = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
  const step = { x: Math.sign(d.x), y: Math.sign(d.y), z: Math.sign(d.z) };
  const next = { x: Infinity, y: Infinity, z: Infinity };
  for (const axis of axes)
    if (Math.abs(d[axis]) >= EPS)
      next[axis] =
        (cell[axis] + (step[axis] > 0 ? 1 : 0) - start[axis]) / d[axis];
  const found = new Map<string, TerrainAddress>();
  function add(value: TerrainAddress) {
    let variants = [value];
    for (const axis of axes)
      if (
        Math.abs(d[axis]) < EPS &&
        Math.abs(p[axis] - Math.round(p[axis])) < EPS
      )
        variants = variants.flatMap((v) => [v, { ...v, [axis]: v[axis] - 1 }]);
    for (const v of variants)
      if (axes.every((axis) => v[axis] >= 0 && v[axis] < dimensions[axis]))
        found.set(`${v.x},${v.y},${v.z}`, v);
  }
  // Include cells touching the entry point even when the ray moves away from their face.
  for (let mask = 0; mask < 8; mask++) {
    const v = { ...cell };
    let valid = true;
    axes.forEach((axis, i) => {
      if (mask & (1 << i)) {
        if (Math.abs(p[axis] - Math.round(p[axis])) < EPS) v[axis]--;
        else valid = false;
      }
    });
    if (valid) add(v);
  }
  for (let iteration = 0; iteration < 310; iteration++) {
    add({ ...cell });
    const t = Math.min(next.x, next.y, next.z);
    if (t > exit + EPS || !Number.isFinite(t)) break;
    const tied = axes.filter((axis) => Math.abs(next[axis] - t) < EPS);
    for (let mask = 1; mask < 1 << tied.length; mask++) {
      const v = { ...cell };
      tied.forEach((axis, i) => {
        if (mask & (1 << i)) v[axis] += step[axis];
      });
      add(v);
    }
    for (const axis of tied) {
      cell[axis] += step[axis];
      next[axis] += 1 / Math.abs(d[axis]);
    }
  }
  return [...found.values()];
}

/** Snapshot-scoped geometry index. Facts only: no range, sense, light, or transparency policy. */
export function createTerrainSightIndex(input: IsometricTerrainVolume) {
  assertTerrainVolume(input);
  // Own a validated copy; later caller mutation must not change an in-flight projection.
  const volume: IsometricTerrainVolume = JSON.parse(JSON.stringify(input));
  const cells = new Map<
    string,
    { address: TerrainAddress; cell: TerrainCell }
  >();
  for (const chunk of volume.chunks)
    for (const cell of chunk.cells) {
      const address = terrainCellAddress(chunk.address, cell.offset);
      cells.set(`${address.x},${address.y},${address.z}`, { address, cell });
    }
  const cache = new Map<string, readonly TerrainSurface[]>();
  function surfaces(address: TerrainAddress): readonly TerrainSurface[] {
    const key = `${address.x},${address.y},${address.z}`,
      entry = cells.get(key);
    if (!entry) return [];
    const existing = cache.get(key);
    if (existing) return existing;
    const parts = entry.cell.opening
      ? terrainOpeningParts(entry.cell.opening)
      : { solid: terrainSolidTriangles(entry.cell.shape) };
    const result = Object.entries(parts).flatMap(([part, triangles]) =>
      triangles.map((triangle, i) => ({
        key: `${key}/${part}/${i}`,
        address: { ...address },
        part: part as TerrainSurfacePart,
        materialKey: entry.cell.materialKey,
        triangle: triangle.map((p) => ({
          x: p.x + address.x,
          y: p.y + address.y,
          z: p.z + address.z,
        })) as unknown as TerrainTriangle,
      })),
    );
    for (const surface of result) {
      Object.freeze(surface.address);
      surface.triangle.forEach(Object.freeze);
      Object.freeze(surface.triangle);
      Object.freeze(surface);
    }
    if (cache.size >= 4096) cache.delete(cache.keys().next().value!);
    cache.set(key, Object.freeze(result));
    return result;
  }
  return {
    surfaces,
    trace(
      start: TerrainPoint,
      end: TerrainPoint,
    ): {
      contacts: readonly TerrainSightContact[];
      originInteriors: readonly {
        address: TerrainAddress;
        part: TerrainSurfacePart;
        materialKey: NamespacedKey;
      }[];
      visitedCells: number;
    } {
      if (
        !axes.every(
          (axis) =>
            Number.isFinite(start[axis]) &&
            Number.isFinite(end[axis]) &&
            Math.abs(start[axis]) <= 1024 &&
            Math.abs(end[axis]) <= 1024,
        )
      )
        throw new TypeError(
          "Sight endpoints must be finite and within supported query bounds.",
        );
      const length = Math.hypot(
        end.x - start.x,
        end.y - start.y,
        end.z - start.z,
      );
      if (length < EPS) throw new TypeError("Sight endpoints must differ.");
      const candidates = segmentCells(start, end, volume.dimensions),
        contacts: TerrainSightContact[] = [];
      const originInteriors: {
        address: TerrainAddress;
        part: TerrainSurfacePart;
        materialKey: NamespacedKey;
      }[] = [];
      for (const address of candidates) {
        const entry = cells.get(`${address.x},${address.y},${address.z}`);
        if (!entry) continue;
        const local = sub(start, address);
        if (
          !entry.cell.opening &&
          local.x > EPS &&
          local.x < 1 - EPS &&
          local.y > EPS &&
          local.y < 1 - EPS &&
          local.z > EPS &&
          local.z <
            terrainSupportHeight(entry.cell.shape, local.x, local.y) - EPS
        )
          originInteriors.push({
            address,
            part: "solid",
            materialKey: entry.cell.materialKey,
          });
        if (entry.cell.opening)
          for (const part of terrainOpeningInteriorParts(
            entry.cell.opening,
            local,
          ))
            originInteriors.push({
              address,
              part,
              materialKey: entry.cell.materialKey,
            });
        for (const surface of surfaces(address)) {
          const t = terrainTriangleSegmentContact(surface.triangle, start, end);
          if (t !== undefined) contacts.push({ distance: t * length, surface });
        }
      }
      contacts.sort(
        (a, b) =>
          a.distance - b.distance || a.surface.key.localeCompare(b.surface.key),
      );
      return { contacts, originInteriors, visitedCells: candidates.length };
    },
  };
}
