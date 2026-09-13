import { describe, expect, it } from "vitest";
import { terrainSurfaceNormals } from "./terrainSurfaceNormals";

describe("visual terrain smoothing", () => {
  const top = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const side = [0, 0, 0, 0, 0, 1, 1, 0, 0];
  it("blends shared boundaries across batches without changing positions", () => {
    const batches = [top, side].map((positions) => ({
      positions,
      strengths: [1, 1, 1],
    }));
    const before = JSON.stringify(batches);
    const normals = terrainSurfaceNormals(batches);
    expect(normals[0].slice(0, 3)).toEqual(normals[1].slice(0, 3));
    expect(normals[0][1]).toBeCloseTo(Math.SQRT1_2);
    expect(normals[0][2]).toBeCloseTo(Math.SQRT1_2);
    expect(JSON.stringify(batches)).toBe(before);
    for (const batch of normals)
      for (let i = 0; i < batch.length; i += 3)
        expect(Math.hypot(...batch.slice(i, i + 3))).toBeCloseTo(1);
  });
  it("preserves flat normals at zero strength and does not blend across gaps", () => {
    const normals = terrainSurfaceNormals([
      { positions: top, strengths: [0, 0, 0] },
      { positions: side, strengths: [1, 1, 1] },
    ]);
    expect(normals[0]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const separate = side.map((v, i) => (i % 3 === 0 ? v + 16 : v));
    expect(
      terrainSurfaceNormals([
        { positions: top, strengths: [1, 1, 1] },
        { positions: separate, strengths: [1, 1, 1] },
      ])[0],
    ).toEqual(normals[0]);
  });
});
