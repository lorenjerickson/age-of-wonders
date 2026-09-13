export interface TerrainNormalBatch {
  positions: readonly number[];
  /** One strength per vertex. Openings are excluded from these batches. */
  strengths: readonly number[];
}

/** Area-weighted shared normals across chunk/material boundaries, with no vertex displacement. */
export function terrainSurfaceNormals(
  batches: readonly TerrainNormalBatch[],
): number[][] {
  const sums = new Map<string, number[]>();
  const key = (p: readonly number[], i: number) =>
    `${p[i]},${p[i + 1]},${p[i + 2]}`;
  const faces = batches.map(({ positions: p }) => {
    const normals: number[] = [];
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i + 3] - p[i],
        ay = p[i + 4] - p[i + 1],
        az = p[i + 5] - p[i + 2];
      const bx = p[i + 6] - p[i],
        by = p[i + 7] - p[i + 1],
        bz = p[i + 8] - p[i + 2];
      const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      const length = Math.hypot(...n) || 1;
      for (let v = 0; v < 9; v += 3) {
        normals.push(...n.map((c) => c / length));
        const k = key(p, i + v),
          sum = sums.get(k) ?? [0, 0, 0];
        n.forEach((c, axis) => (sum[axis] += c));
        sums.set(k, sum);
      }
    }
    return normals;
  });
  return batches.map(({ positions, strengths }, batch) => {
    const normals = faces[batch];
    for (let i = 0; i < positions.length; i += 3) {
      const strength = strengths[i / 3];
      if (!strength) continue;
      const sum = sums.get(key(positions, i))!;
      const length = Math.hypot(...sum);
      if (!length) continue;
      const blended = sum.map(
        (c, axis) =>
          (1 - strength) * normals[i + axis] + (strength * c) / length,
      );
      const magnitude = Math.hypot(...blended);
      if (magnitude)
        blended.forEach((c, axis) => (normals[i + axis] = c / magnitude));
    }
    return normals;
  });
}
