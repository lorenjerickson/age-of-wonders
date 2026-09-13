import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createTerrainVolume,
  terrainVolumeIssue,
  terrainShapePreset,
  isTerrainShape,
  isDifficultTerrainShape,
  terrainSolidTriangles,
  terrainSupportHeight,
  intersectTerrainShape,
  applyTerrainWrites,
  editTerrainSelection,
  terrainCellIndex,
  terrainCellAddress,
  terrainRegionAddresses,
  generateTerrainPreview,
} from "../dist/index.js";

const materials = [
  {
    key: "terrain:grass",
    terrainType: "terrain:grass",
    revision: 1,
    name: "Grass",
  },
  {
    key: "terrain:rock",
    terrainType: "terrain:rock",
    revision: 1,
    name: "Rock",
  },
];
const empty = (dimensions = { x: 100, y: 100, z: 100 }) =>
  createTerrainVolume(dimensions, materials);
const cell = (preset = "cube", extra = {}) => ({
  materialKey: "terrain:grass",
  shape: terrainShapePreset(preset),
  ...extra,
});
const placed = () =>
  applyTerrainWrites(empty(), [
    { address: { x: 0, y: 0, z: 0 }, cell: cell("ramp") },
    {
      address: { x: 16, y: 8, z: 25 },
      cell: cell("cube", {
        opening: {
          id: "door-private",
          facing: 1,
          frameThickness: 0.125,
          kind: "door",
          state: "locked",
        },
      }),
    },
    {
      address: { x: 99, y: 99, z: 99 },
      cell: cell("valley", { smoothing: 0.5 }),
    },
  ]).volume;
const settings = (overrides = {}) => ({
  version: 1,
  seed: 20260911,
  preset: "rolling-hills",
  region: { minimum: { x: 0, y: 0, z: 0 }, maximum: { x: 31, y: 31, z: 15 } },
  minimumElevation: 2,
  maximumElevation: 14,
  baseElevation: 7,
  featureSize: 12,
  roughness: 0.5,
  materialKey: "terrain:grass",
  mode: "fill-empty",
  ...overrides,
});
const clone = (v) => JSON.parse(JSON.stringify(v));
const contentHash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Freeze inputs to detect accidental mutation in batch/generation operations.
function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

describe("spatial terrain bounds and serialization", () => {
  it("creates empty sparse five-foot terrain without allocating a million cells", () => {
    const volume = empty();
    assert.equal(terrainVolumeIssue(volume), undefined);
    assert.deepEqual(volume.chunks, []);
    assert.deepEqual(volume.cellSize, { value: 5, unit: "ft" });
  });
  for (const value of [0, -1, 101, 1.1, NaN, Infinity]) {
    it(`rejects invalid dimension ${value}`, () =>
      assert.throws(() => empty({ x: value, y: 100, z: 100 }), /dimensions/));
  }
  it("round-trips edge cells, stacked cells, openings and shapes", () => {
    const result = clone(placed());
    assert.equal(terrainVolumeIssue(result), undefined);
    assert.equal(terrainCellIndex(result).size, 3);
    assert.equal(
      terrainCellIndex(result).get("16,8,25").opening.state,
      "locked",
    );
    assert.deepEqual(terrainCellAddress({ x: 6, y: 6, z: 6 }, 819), {
      x: 99,
      y: 99,
      z: 99,
    });
  });
  it("rejects cells in the padding of the last partial chunk", () => {
    const v = clone(placed());
    v.chunks.at(-1).cells[0].offset = 820;
    assert.match(terrainVolumeIssue(v), /inside the map/);
  });
  it("rejects duplicate chunks, offsets and opening identities", () => {
    let v = clone(placed());
    v.chunks.push(v.chunks[0]);
    assert.match(terrainVolumeIssue(v), /unique addresses/);
    v = clone(placed());
    v.chunks[0].cells.push(v.chunks[0].cells[0]);
    assert.match(terrainVolumeIssue(v), /unique addresses/);
    assert.throws(
      () =>
        applyTerrainWrites(placed(), [
          {
            address: { x: 1, y: 1, z: 1 },
            cell: cell("cube", {
              opening: {
                id: "door-private",
                facing: 0,
                frameThickness: 0.125,
                kind: "door",
                state: "open",
              },
            }),
          },
        ]),
      /unique identity/,
    );
  });
  it("rejects missing material and invalid physical scale, without leaking opaque identifiers", () => {
    const v = clone(placed());
    v.chunks[0].cells[0].materialKey = "private:unknown-id";
    const issue = terrainVolumeIssue(v);
    assert.match(issue, /unavailable material/);
    assert.ok(!issue.includes("private"));
    v.cellSize.value = 0.5;
    assert.match(terrainVolumeIssue(v), /five-foot/);
  });
  it("rejects empty chunks and ambiguous material keys", () => {
    const v = empty();
    v.chunks.push({ address: { x: 0, y: 0, z: 0 }, cells: [] });
    assert.match(terrainVolumeIssue(v), /Empty terrain chunks/);
    v.chunks = [];
    v.materials.push(v.materials[0]);
    assert.match(terrainVolumeIssue(v), /unique keys/);
  });
  it("accepts all door states and only open/closed windows", () => {
    for (const kind of ["door", "window"])
      for (const state of ["open", "closed", "locked"]) {
        const run = () =>
          applyTerrainWrites(empty(), [
            {
              address: { x: 0, y: 0, z: 0 },
              cell: cell("cube", {
                opening: {
                  id: "opening",
                  facing: 0,
                  frameThickness: 0.125,
                  kind,
                  state,
                },
              }),
            },
          ]);
        if (kind === "window" && state === "locked")
          assert.throws(run, /state/);
        else assert.doesNotThrow(run);
      }
  });
  it("rejects sloped/smoothed openings, malformed states and invalid frames", () => {
    for (const extra of [
      { shape: terrainShapePreset("ramp") },
      { smoothing: 0.1 },
      {
        opening: {
          id: "opening",
          facing: 0,
          frameThickness: 0.5,
          kind: "door",
          state: "open",
        },
      },
      {
        opening: {
          id: "opening",
          facing: 0,
          frameThickness: 0.125,
          kind: "door",
          state: ["open"],
        },
      },
    ])
      assert.throws(() =>
        applyTerrainWrites(empty(), [
          {
            address: { x: 0, y: 0, z: 0 },
            cell: cell("cube", {
              opening: {
                id: "opening",
                facing: 0,
                frameThickness: 0.125,
                kind: "door",
                state: "open",
              },
              ...extra,
            }),
          },
        ]),
      );
  });
});

describe("canonical shape geometry", () => {
  it("distinguishes ridge and valley support at the shared diagonal center", () => {
    assert.equal(
      terrainSupportHeight(terrainShapePreset("ridge"), 0.5, 0.5),
      1,
    );
    assert.equal(
      terrainSupportHeight(terrainShapePreset("valley"), 0.5, 0.5),
      0,
    );
  });
  it("rotates ramps and returns to the same geometry after four turns", () => {
    const ramp = terrainShapePreset("ramp");
    assert.equal(terrainSupportHeight(ramp, 0.25, 0.7), 0.25);
    assert.equal(
      terrainSupportHeight(terrainShapePreset("ramp", 1), 0.25, 0.7),
      0.7,
    );
    assert.deepEqual(terrainShapePreset("ramp", 4), ramp);
    assert.deepEqual(
      terrainShapePreset("ridge", -1),
      terrainShapePreset("ridge", 3),
    );
  });
  it("classifies slopes independently of material or visual smoothing", () => {
    assert.equal(isDifficultTerrainShape(terrainShapePreset("cube")), false);
    assert.equal(
      isDifficultTerrainShape({ top: [0.5, 0.5, 0.5, 0.5], diagonal: "00-11" }),
      false,
    );
    for (const preset of ["ramp", "ridge", "valley"])
      assert.equal(isDifficultTerrainShape(terrainShapePreset(preset)), true);
  });
  it("rejects invalid, unquantized, empty and sparse top shapes", () => {
    for (const top of [
      [0, 0, 0, 0],
      [1, 1, 1],
      [1, 1, 1, NaN],
      [1, 1, 1, 0.1],
      [1, , ,],
    ])
      assert.equal(isTerrainShape({ top, diagonal: "00-11" }), false);
    assert.throws(() =>
      terrainSupportHeight(terrainShapePreset("cube"), -0.1, 0.5),
    );
  });
  it("ray intersections agree with support at many samples and rotations", () => {
    for (const preset of ["cube", "ramp", "ridge", "valley"])
      for (let turn = 0; turn < 4; turn++) {
        const shape = terrainShapePreset(preset, turn);
        for (const x of [0.1, 0.4, 0.8])
          for (const y of [0.2, 0.6, 0.9]) {
            const hit = intersectTerrainShape(
              shape,
              { x, y, z: 2 },
              { x: 0, y: 0, z: -4 },
            );
            assert.ok(
              Math.abs(hit - (2 - terrainSupportHeight(shape, x, y))) < 1e-8,
            );
          }
      }
  });
  it("has correct closed-solid volumes with outward face winding", () => {
    for (const [preset, expected] of [
      ["cube", 1],
      ["ramp", 0.5],
      ["ridge", 2 / 3],
      ["valley", 1 / 3],
    ]) {
      const triangles = terrainSolidTriangles(terrainShapePreset(preset));
      const signedVolume = triangles.reduce(
        (sum, [a, b, c]) =>
          sum +
          (a.x * (b.y * c.z - b.z * c.y) +
            a.y * (b.z * c.x - b.x * c.z) +
            a.z * (b.x * c.y - b.y * c.x)) /
            6,
        0,
      );
      assert.ok(Math.abs(signedVolume - expected) < 1e-8);
    }
  });
  it("handles missed, horizontal and invalid rays", () => {
    const cube = terrainShapePreset("cube");
    assert.equal(
      intersectTerrainShape(cube, { x: 2, y: 2, z: 2 }, { x: 0, y: 0, z: -1 }),
      undefined,
    );
    assert.equal(
      intersectTerrainShape(
        cube,
        { x: -1, y: 0.5, z: 0.5 },
        { x: 1, y: 0, z: 0 },
      ),
      1,
    );
    assert.throws(() =>
      intersectTerrainShape(cube, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
  });
});

describe("atomic arbitrary terrain edits", () => {
  it("changes disconnected materials while preserving shape, smoothing and opening state", () => {
    const source = freeze(placed());
    const selection = [
      { x: 16, y: 8, z: 25 },
      { x: 99, y: 99, z: 99 },
    ];
    const edit = editTerrainSelection(source, selection, {
      kind: "material",
      materialKey: "terrain:rock",
    });
    const oldCells = terrainCellIndex(source),
      newCells = terrainCellIndex(edit.volume);
    for (const key of ["16,8,25", "99,99,99"])
      assert.deepEqual(newCells.get(key), {
        ...oldCells.get(key),
        materialKey: "terrain:rock",
      });
    assert.deepEqual(newCells.get("0,0,0"), oldCells.get("0,0,0"));
    assert.deepEqual(applyTerrainWrites(edit.volume, edit.undo).volume, source);
    assert.deepEqual(applyTerrainWrites(source, edit.redo).volume, edit.volume);
  });
  it("removes exactly selected cells, including doors, and omits newly empty chunks", () => {
    const source = freeze(placed());
    const edit = editTerrainSelection(
      source,
      [
        { x: 16, y: 8, z: 25 },
        { x: 16, y: 8, z: 25 },
      ],
      { kind: "remove" },
    );
    assert.equal(terrainCellIndex(edit.volume).size, 2);
    assert.equal(edit.volume.chunks.length, 2);
    assert.deepEqual(applyTerrainWrites(edit.volume, edit.undo).volume, source);
  });
  it("preserves overlapping levels when removing a lower cell", () => {
    const source = applyTerrainWrites(
      empty(),
      [0, 5].map((z) => ({ address: { x: 1, y: 1, z }, cell: cell() })),
    ).volume;
    const result = editTerrainSelection(source, [{ x: 1, y: 1, z: 0 }], {
      kind: "remove",
    }).volume;
    assert.ok(terrainCellIndex(result).has("1,1,5"));
    assert.equal(terrainCellIndex(result).size, 1);
  });
  it("handles empty selections and selected air without creating cells", () => {
    for (const selection of [[], [{ x: 8, y: 8, z: 8 }]]) {
      const result = editTerrainSelection(placed(), selection, {
        kind: "material",
        materialKey: "terrain:rock",
      });
      assert.deepEqual(result.volume, placed());
      assert.deepEqual(result.undo, []);
    }
  });
  it("rejects an entire mixed-validity batch without changing the source", () => {
    const source = freeze(placed()),
      before = contentHash(source);
    assert.throws(
      () =>
        applyTerrainWrites(source, [
          { address: { x: 0, y: 0, z: 0 }, cell: null },
          { address: { x: 100, y: 0, z: 0 }, cell: cell() },
        ]),
      /outside/,
    );
    assert.equal(contentHash(source), before);
    assert.throws(
      () =>
        applyTerrainWrites(source, [
          { address: { x: 0, y: 0, z: 0 }, cell: null },
          {
            address: { x: 1, y: 0, z: 0 },
            cell: { ...cell(), materialKey: "missing:material" },
          },
        ]),
      /unavailable/,
    );
    assert.equal(contentHash(source), before);
  });
  it("rejects duplicate writes and unknown operations", () => {
    const write = { address: { x: 0, y: 0, z: 0 }, cell: cell() };
    assert.throws(() => applyTerrainWrites(empty(), [write, write]), /repeats/);
    assert.throws(
      () => editTerrainSelection(empty(), [], { kind: "oops" }),
      /operation/,
    );
  });
  it("uses inclusive 2D/3D selections and does not silently clip bounds", () => {
    assert.equal(
      terrainRegionAddresses(
        { minimum: { x: 2, y: 3, z: 4 }, maximum: { x: 5, y: 7, z: 4 } },
        empty().dimensions,
      ).length,
      20,
    );
    assert.equal(
      terrainRegionAddresses(
        { minimum: { x: 0, y: 0, z: 0 }, maximum: { x: 1, y: 1, z: 1 } },
        empty().dimensions,
      ).length,
      8,
    );
    assert.throws(() =>
      terrainRegionAddresses(
        { minimum: { x: 0, y: 0, z: 0 }, maximum: { x: 100, y: 0, z: 0 } },
        empty().dimensions,
      ),
    );
  });
});

describe("weighted seeded terrain generation", () => {
  it("pins version-one elevations and favors locally coherent terrain", () => {
    const preview = generateTerrainPreview(empty(), settings({ seed: 42 }));
    const heights = new Map();
    for (const { address, cell: value } of preview.writes)
      heights.set(
        `${address.x},${address.y}`,
        address.z + terrainSupportHeight(value.shape, 0.5, 0.5),
      );
    assert.deepEqual(
      [0, 4, 8, 12, 16, 20, 24, 28].map((x) => heights.get(`${x},8`)),
      [7, 7, 7.125, 7.34375, 7.59375, 8.40625, 8.84375, 8.1875],
    );
    let nearby = 0,
      distant = 0;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 16; x++) {
        nearby += Math.abs(
          heights.get(`${x},${y}`) - heights.get(`${x + 1},${y}`),
        );
        distant += Math.abs(
          heights.get(`${x},${y}`) - heights.get(`${x + 16},${y}`),
        );
      }
    assert.ok(
      nearby < distant / 4,
      "Adjacent columns should be more similar than distant terrain",
    );
  });

  it("reproduces an exact candidate across JSON round trips without mutating input", () => {
    const source = freeze(empty()),
      before = contentHash(source);
    const first = generateTerrainPreview(source, settings());
    assert.deepEqual(
      generateTerrainPreview(clone(source), clone(settings())),
      first,
    );
    assert.notDeepEqual(
      generateTerrainPreview(source, settings({ seed: 42 })).writes,
      first.writes,
    );
    assert.equal(contentHash(source), before);
    assert.equal(
      terrainVolumeIssue(applyTerrainWrites(source, first.writes).volume),
      undefined,
    );
  });
  it("keeps every existing cell in Fill Empty, including bridge/opening cells", () => {
    const source = placed();
    const preview = generateTerrainPreview(source, settings());
    const result = applyTerrainWrites(source, preview.writes).volume;
    for (const [key, value] of terrainCellIndex(source))
      assert.deepEqual(terrainCellIndex(result).get(key), value);
    assert.ok(preview.skipped > 0);
  });
  it("replaces only a selected mask, including erasure above the generated surface", () => {
    const source = applyTerrainWrites(empty(), [
      { address: { x: 2, y: 2, z: 14 }, cell: cell() },
      { address: { x: 2, y: 3, z: 14 }, cell: cell() },
    ]).volume;
    const mask = [
      { x: 2, y: 2, z: 14 },
      { x: 1, y: 1, z: 0 },
    ];
    const preview = generateTerrainPreview(
      source,
      settings({ mode: "replace-region", mask }),
    );
    assert.equal(preview.removed, 1);
    assert.equal(preview.created, 1);
    const result = applyTerrainWrites(source, preview.writes);
    assert.ok(!terrainCellIndex(result.volume).has("2,2,14"));
    assert.ok(terrainCellIndex(result.volume).has("2,3,14"));
    assert.deepEqual(
      applyTerrainWrites(result.volume, result.undo).volume,
      source,
    );
    assert.deepEqual(
      generateTerrainPreview(source, settings({ mask: [] })).writes,
      [],
    );
  });
  it("uses map coordinates consistently across chunk-sized regions", () => {
    const full = generateTerrainPreview(empty(), settings());
    const left = generateTerrainPreview(
      empty(),
      settings({
        region: {
          minimum: { x: 0, y: 0, z: 0 },
          maximum: { x: 15, y: 31, z: 15 },
        },
      }),
    );
    const right = generateTerrainPreview(
      empty(),
      settings({
        region: {
          minimum: { x: 16, y: 0, z: 0 },
          maximum: { x: 31, y: 31, z: 15 },
        },
      }),
    );
    assert.deepEqual(
      applyTerrainWrites(empty(), [...left.writes, ...right.writes]).volume,
      applyTerrainWrites(empty(), full.writes).volume,
    );
  });
  it("produces supported ground with no floating layer below its top", () => {
    const result = applyTerrainWrites(
      empty(),
      generateTerrainPreview(
        empty(),
        settings({ preset: "mountains", featureSize: 2, roughness: 1 }),
      ).writes,
    ).volume;
    const index = terrainCellIndex(result);
    for (const key of index.keys()) {
      const [x, y, z] = key.split(",").map(Number);
      if (z > 0)
        assert.deepEqual(
          index.get(`${x},${y},${z - 1}`).shape.top,
          [1, 1, 1, 1],
        );
    }
  });
  it("gives mountains more relief than plains across a fixed seed suite", () => {
    const spreads = { plains: 0, mountains: 0 };
    for (const preset of Object.keys(spreads))
      for (const seed of [0, 1, 42, 20260911]) {
        const preview = generateTerrainPreview(
          empty(),
          settings({ seed, preset }),
        );
        const columns = new Map();
        for (const { address, cell: value } of preview.writes)
          columns.set(
            `${address.x},${address.y}`,
            address.z + Math.max(...value.shape.top),
          );
        const heights = [...columns.values()];
        spreads[preset] += Math.max(...heights) - Math.min(...heights);
      }
    assert.ok(spreads.mountains > spreads.plains * 2);
  });
  it("rejects malformed seeds, ranges, masks and generator versions", () => {
    for (const invalid of [
      { seed: -1 },
      { seed: 2 ** 32 },
      { version: 2 },
      { preset: "toString" },
      { minimumElevation: 0.03 },
      { maximumElevation: 17 },
      { baseElevation: 20 },
      { roughness: NaN },
      { featureSize: 0 },
      { mask: [{ x: 99, y: 0, z: 0 }] },
    ])
      assert.throws(() => generateTerrainPreview(empty(), settings(invalid)));
  });
  it("can generate a legal million-cell volume and remove it as one reversible batch", () => {
    const full = generateTerrainPreview(
      empty(),
      settings({
        region: {
          minimum: { x: 0, y: 0, z: 0 },
          maximum: { x: 99, y: 99, z: 99 },
        },
        minimumElevation: 100,
        maximumElevation: 100,
        baseElevation: 100,
      }),
    );
    assert.equal(full.created, 1_000_000);
    const built = applyTerrainWrites(empty(), full.writes);
    assert.equal(built.volume.chunks.length, 343);
    assert.equal(terrainVolumeIssue(built.volume), undefined);
    const removed = applyTerrainWrites(built.volume, built.undo);
    assert.deepEqual(removed.volume, empty());
    assert.equal(removed.undo.length, 1_000_000);
  });
});
