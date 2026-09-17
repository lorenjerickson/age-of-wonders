import { expect, it } from "vitest";
import {
  applyTerrainWrites,
  createTerrainVolume,
  terrainShapePreset,
  terrainSupportHeight,
} from "@aow/common";
import { TERRAIN_PALETTE } from "./isometricEditorModel";
import {
  createSessionSurfacePicker,
  sessionClickWasDrag,
  terrainViewportFocus,
} from "./sessionViewportModel";

it("keeps continuous Session coordinates distinct from editor cell addresses", () => {
  const p = { x: 0.5, y: 1.25, z: 2 };
  expect(terrainViewportFocus(p, p)).toEqual({ x: 0.5, y: 1.25, z: 3 });
  expect(terrainViewportFocus(p)).toEqual({ x: 1, y: 1.75, z: 3 });
  expect(sessionClickWasDrag({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false);
  expect(sessionClickWasDrag({ x: 0, y: 0 }, { x: 6, y: 1 })).toBe(true);
});
it("resolves exact authored support, rejects walls and preserves stacked candidates", () => {
  const volume = applyTerrainWrites(
    createTerrainVolume({ x: 10, y: 10, z: 10 }, TERRAIN_PALETTE),
    [0, 3].map((z) => ({
      address: { x: 1, y: 1, z },
      cell: { materialKey: "terrain:grass", shape: terrainShapePreset("cube") },
    })),
  );
  const pick = createSessionSurfacePicker(volume.volume);
  expect(
    pick([
      { point: { x: 1.25, y: 1.5, z: 4.0000001 }, normalZ: 1 },
      { point: { x: 1.25, y: 1.5, z: 4 }, normalZ: 1 },
      { point: { x: 1.25, y: 1.5, z: 1 }, normalZ: 1 },
      { point: { x: 1.25, y: 1.5, z: 2 }, normalZ: 0 },
      { point: { x: 1.25, y: 1.5, z: 1 }, normalZ: -1 },
      { point: { x: -1, y: 1.5, z: 1 }, normalZ: 1 },
    ]),
  ).toEqual([
    { x: 1.25, y: 1.5, z: 4 },
    { x: 1.25, y: 1.5, z: 1 },
  ]);
});

it("normalizes fractional ramp height without rounding the declaration", () => {
  const shape = terrainShapePreset("ramp");
  const volume = applyTerrainWrites(
    createTerrainVolume({ x: 10, y: 10, z: 10 }, TERRAIN_PALETTE),
    [
      {
        address: { x: 1, y: 1, z: 2 },
        cell: { materialKey: "terrain:grass", shape },
      },
    ],
  ).volume;
  const height = 2 + terrainSupportHeight(shape, 0.123456789, 0.345678912);
  expect(
    createSessionSurfacePicker(volume)([
      {
        point: { x: 1.123456789, y: 1.345678912, z: height + 1e-7 },
        normalZ: 0.7,
      },
    ])[0]?.z,
  ).toBeCloseTo(height, 14);
});
