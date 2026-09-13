import { describe, expect, it } from "vitest";
import {
  applyTerrainWrites,
  createTerrainVolume,
  terrainShapePreset,
} from "@aow/common";
import {
  mergeTerrainSelection,
  planeSelection,
  terrainPlacementWrites,
  terrainPreviewActor,
  TERRAIN_PALETTE,
} from "./isometricEditorModel";
const empty = () =>
  createTerrainVolume({ x: 100, y: 100, z: 100 }, TERRAIN_PALETTE);
describe("isometric editor interactions", () => {
  it("builds inclusive plane strokes and refuses elevation changes mid-stroke", () => {
    expect(
      planeSelection(
        { x: 5, y: 7, z: 4 },
        { x: 2, y: 3, z: 4 },
        empty().dimensions,
      ),
    ).toHaveLength(20);
    expect(() =>
      planeSelection(
        { x: 1, y: 1, z: 1 },
        { x: 1, y: 1, z: 2 },
        empty().dimensions,
      ),
    ).toThrow();
  });
  it("combines disconnected selections and subtracts only matching addresses", () => {
    const lower = { x: 1, y: 1, z: 0 },
      upper = { x: 1, y: 1, z: 9 };
    expect(mergeTerrainSelection([lower], [upper, lower], "add")).toEqual([
      lower,
      upper,
    ]);
    expect(mergeTerrainSelection([lower, upper], [lower], "subtract")).toEqual([
      upper,
    ]);
    expect(mergeTerrainSelection([lower], [upper], "replace")).toEqual([upper]);
  });
  it("fills air without overwriting authored terrain or openings", () => {
    const first = { x: 0, y: 0, z: 0 },
      second = { x: 1, y: 0, z: 0 };
    const volume = applyTerrainWrites(empty(), [
      {
        address: first,
        cell: {
          materialKey: "terrain:grass",
          shape: terrainShapePreset("ramp"),
        },
      },
    ]).volume;
    expect(
      terrainPlacementWrites(
        volume,
        [first, second],
        "terrain:rock",
        terrainShapePreset("cube"),
      ),
    ).toEqual([
      {
        address: second,
        cell: {
          materialKey: "terrain:rock",
          shape: terrainShapePreset("cube"),
        },
      },
    ]);
  });
  it("keeps the preview actor on the highest surface, including sloped tops", () => {
    const volume = applyTerrainWrites(
      empty(),
      [0, 5].map((z) => ({
        address: { x: 10, y: 10, z },
        cell: {
          materialKey: "terrain:grass" as const,
          shape: terrainShapePreset("ramp"),
        },
      })),
    ).volume;
    expect(terrainPreviewActor(volume, 10, 10)).toEqual({
      x: 10,
      y: 10,
      z: 5.5,
    });
    expect(terrainPreviewActor(volume, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("bulk opening authoring", () => {
  it("preserves identity through edits and restores exact openings with undo", async () => {
    const { terrainOpeningWrites } = await import("./isometricEditorModel");
    const a = { x: 0, y: 0, z: 0 },
      b = { x: 0, y: 0, z: 7 };
    const volume = applyTerrainWrites(
      empty(),
      terrainPlacementWrites(
        empty(),
        [a, b],
        "terrain:wood",
        terrainShapePreset("cube"),
      ),
    ).volume;
    let next = 0;
    const door = {
      kind: "door" as const,
      state: "locked" as const,
      facing: 1 as const,
      frameThickness: 0.125,
    };
    const result = applyTerrainWrites(
      volume,
      terrainOpeningWrites(
        volume,
        [a, a, b, { x: 9, y: 9, z: 9 }],
        door,
        () => `opening-${++next}`,
      ),
    );
    expect(next).toBe(2);
    const changed = applyTerrainWrites(
      result.volume,
      terrainOpeningWrites(
        result.volume,
        [b],
        { ...door, state: "open" },
        () => {
          throw new Error("Identity must remain stable");
        },
      ),
    );
    expect(applyTerrainWrites(changed.volume, changed.undo).volume).toEqual(
      result.volume,
    );
    const removed = applyTerrainWrites(
      result.volume,
      terrainOpeningWrites(result.volume, [a], null),
    );
    expect(applyTerrainWrites(removed.volume, removed.undo).volume).toEqual(
      result.volume,
    );
    expect(applyTerrainWrites(result.volume, result.undo).volume).toEqual(
      volume,
    );
  });
  it("rejects mixed incompatible cells before allocating identities or mutating terrain", async () => {
    const { terrainOpeningWrites } = await import("./isometricEditorModel");
    const a = { x: 0, y: 0, z: 0 },
      b = { x: 1, y: 0, z: 0 };
    for (const cell of [
      { shape: terrainShapePreset("ramp") },
      { shape: terrainShapePreset("cube"), smoothing: 0.5 },
    ]) {
      const volume = applyTerrainWrites(empty(), [
        {
          address: a,
          cell: {
            materialKey: "terrain:wood",
            shape: terrainShapePreset("cube"),
          },
        },
        { address: b, cell: { materialKey: "terrain:wood", ...cell } },
      ]).volume;
      const before = JSON.stringify(volume);
      expect(() =>
        terrainOpeningWrites(
          volume,
          [a, b],
          { kind: "window", state: "closed", facing: 0, frameThickness: 0.125 },
          () => {
            throw new Error("Must validate first");
          },
        ),
      ).toThrow("require cube cells");
      expect(JSON.stringify(volume)).toBe(before);
    }
  });
});

describe("vertical authoring and smoothing", () => {
  it("selects inclusive rectangles in both vertical planes", () => {
    const d = empty().dimensions;
    const xz = planeSelection(
      { x: 2, y: 8, z: 9 },
      { x: 4, y: 8, z: 6 },
      d,
      "xz",
    );
    expect(xz).toHaveLength(12);
    expect(xz.every((a) => a.y === 8)).toBe(true);
    const yz = planeSelection(
      { x: 8, y: 2, z: 9 },
      { x: 8, y: 4, z: 6 },
      d,
      "yz",
    );
    expect(yz).toHaveLength(12);
    expect(yz.every((a) => a.x === 8)).toBe(true);
    expect(() =>
      planeSelection({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, d, "xz"),
    ).toThrow();
    expect(() =>
      planeSelection({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, d, "yz"),
    ).toThrow();
  });
  it("undoes exact smoothing and rejects openings without partial edits", async () => {
    const { terrainSmoothingWrites, terrainOpeningWrites } =
      await import("./isometricEditorModel");
    const a = { x: 1, y: 1, z: 0 },
      b = { x: 1, y: 1, z: 16 };
    const volume = applyTerrainWrites(
      empty(),
      terrainPlacementWrites(
        empty(),
        [a, b],
        "terrain:grass",
        terrainShapePreset("cube"),
      ),
    ).volume;
    const result = applyTerrainWrites(
      volume,
      terrainSmoothingWrites(volume, [a, b], 0.5),
    );
    expect(
      result.volume.chunks.every((c) =>
        c.cells.every((cell) => cell.smoothing === 0.5),
      ),
    ).toBe(true);
    expect(applyTerrainWrites(result.volume, result.undo).volume).toEqual(
      volume,
    );
    const door = applyTerrainWrites(
      volume,
      terrainOpeningWrites(
        volume,
        [b],
        { kind: "door", state: "open", facing: 0, frameThickness: 0.125 },
        () => "door",
      ),
    ).volume;
    expect(() => terrainSmoothingWrites(door, [a, b], 1)).toThrow(
      "cannot be smoothed",
    );
    expect(() => terrainSmoothingWrites(volume, [a], NaN)).toThrow();
    expect(() => terrainSmoothingWrites(volume, [a], 1.1)).toThrow();
  });
});
