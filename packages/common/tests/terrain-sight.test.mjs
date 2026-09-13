import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createTerrainVolume,
  applyTerrainWrites,
  terrainShapePreset,
  createTerrainSightIndex,
  terrainOpeningParts,
  terrainTriangleSegmentContact,
} from "../dist/index.js";
const material = {
  key: "terrain:stone",
  revision: 1,
  name: "Stone",
  terrainType: "terrain:stone",
};
const cell = (shape = "cube", opening) => ({
  materialKey: material.key,
  shape: terrainShapePreset(shape),
  ...(opening ? { opening } : {}),
});
const volume = (writes) =>
  applyTerrainWrites(
    createTerrainVolume({ x: 100, y: 100, z: 100 }, [material]),
    writes,
  ).volume;
const p = (x, y, z) => ({ x, y, z });
describe("canonical 3D sight facts", () => {
  it("traces sparse cells, stacked floors, and inside starts without inventing visibility policy", () => {
    const index = createTerrainSightIndex(
      volume([0, 3].map((z) => ({ address: p(5, 5, z), cell: cell() }))),
    );
    assert.equal(index.trace(p(5.5, 0, 2), p(5.5, 10, 2)).contacts.length, 0);
    assert(
      index
        .trace(p(5.5, 5.5, 5), p(5.5, 5.5, -1))
        .contacts.some((h) => h.surface.address.z === 3),
    );
    assert.equal(
      index.trace(p(5.5, 5.5, 0.5), p(6.5, 5.5, 0.5)).originInteriors[0].part,
      "solid",
    );
    assert.throws(() => index.trace(p(0, 0, 0), p(0, 0, 0)));
    assert.throws(() => index.trace(p(NaN, 0, 0), p(1, 1, 1)));
  });
  it("uses the same openings as rendering and retains frame/panel/glass facts", () => {
    for (const facing of [0, 1, 2, 3])
      for (const kind of ["door", "window"])
        for (const state of ["open", "closed", "locked"]) {
          if (kind === "window" && state === "locked") continue;
          const opening = {
            id: "opening",
            kind,
            state,
            facing,
            frameThickness: 0.125,
          };
          const index = createTerrainSightIndex(
            volume([{ address: p(5, 5, 5), cell: cell("cube", opening) }]),
          );
          const start = facing % 2 ? p(4, 5.5, 5.5) : p(5.5, 4, 5.5),
            end = facing % 2 ? p(7, 5.5, 5.5) : p(5.5, 7, 5.5);
          const hits = index.trace(start, end).contacts;
          if (state === "open") assert.equal(hits.length, 0);
          else
            assert(
              hits.some(
                (h) =>
                  h.surface.part === (kind === "window" ? "glass" : "panel"),
              ),
            );
          const parts = terrainOpeningParts(opening);
          assert(parts.frame.length > 0);
          if (state !== "open")
            assert.equal(
              index.trace(p(5.5, 5.5, 5.5), end).originInteriors[0].part,
              kind === "window" ? "glass" : "panel",
            );
        }
  });
  it("distinguishes sloped solids and preserves coplanar, edge, and endpoint contact", () => {
    const index = createTerrainSightIndex(
      volume([{ address: p(0, 0, 0), cell: cell("ramp") }]),
    );
    assert.equal(
      index.trace(p(0.1, -1, 0.8), p(0.1, 2, 0.8)).contacts.length,
      0,
    );
    assert(index.trace(p(0.9, -1, 0.8), p(0.9, 2, 0.8)).contacts.length > 0);
    const triangle = [p(0, 0, 0), p(1, 0, 0), p(0, 1, 0)];
    assert(
      terrainTriangleSegmentContact(triangle, p(-1, 0, 0), p(1, 0, 0)) !==
        undefined,
    );
    assert.equal(
      terrainTriangleSegmentContact(
        triangle,
        p(0.25, 0.25, 1),
        p(0.25, 0.25, 0),
      ),
      1,
    );
    assert.equal(
      terrainTriangleSegmentContact(triangle, p(2, 2, 0), p(3, 3, 0)),
      undefined,
    );
  });
  it("visits boundary neighbors and matches exhaustive surface tracing over a fixed ray suite", () => {
    const writes = [];
    for (let x = 14; x < 18; x++)
      for (let y = 14; y < 18; y++)
        for (let z = 0; z < 3; z++)
          if ((x + y + z) % 3 === 0)
            writes.push({
              address: p(x, y, z),
              cell: cell((x + y) % 2 ? "ramp" : "cube"),
            });
    const index = createTerrainSightIndex(volume(writes));
    const surfaces = writes.flatMap((w) => index.surfaces(w.address));
    const rays = [
      [p(14, 14, 0), p(18, 18, 3)],
      [p(16, 12, 1), p(16, 20, 1)],
      [p(12, 16, 2), p(20, 16, 2)],
    ];
    let seed = 7;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 100; i++)
      rays.push([
        p(12 + rand() * 8, 12 + rand() * 8, rand() * 4),
        p(12 + rand() * 8, 12 + rand() * 8, rand() * 4),
      ]);
    for (const [start, end] of rays) {
      const actual = index.trace(start, end);
      const expected = surfaces
        .filter(
          (s) =>
            terrainTriangleSegmentContact(s.triangle, start, end) !== undefined,
        )
        .map((s) => s.key)
        .sort();
      assert.deepEqual(
        actual.contacts.map((c) => c.surface.key).sort(),
        expected,
      );
      assert(actual.visitedCells < 1000);
    }
  });
  it("owns immutable geometry after source changes and ignores visual smoothing", () => {
    const source = volume([{ address: p(1, 1, 1), cell: cell() }]);
    const index = createTerrainSightIndex(source);
    source.chunks[0].cells[0].shape.top[0] = 0;
    const surface = index.surfaces(p(1, 1, 1))[0];
    assert(Object.isFrozen(surface.triangle[0]));
    assert.throws(() => (surface.triangle[0].x = 99));
    assert(index.trace(p(0, 1.5, 1.5), p(3, 1.5, 1.5)).contacts.length > 0);
  });
});
