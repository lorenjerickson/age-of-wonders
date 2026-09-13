import { describe, expect, it } from "vitest";
import { terrainOpeningGeometry } from "./terrainOpeningGeometry";
import type { TerrainOpening } from "@aow/common";

describe("opening presentation geometry", () => {
  it("retains bounded frames in every orientation and state", () => {
    for (const kind of ["door", "window"] as const)
      for (const state of ["open", "closed", "locked"] as const) {
        if (kind === "window" && state === "locked") continue;
        for (const facing of [0, 1, 2, 3] as const) {
          const geometry = terrainOpeningGeometry({
            id: "test",
            kind,
            state,
            facing,
            frameThickness: 1 / 8,
          } as TerrainOpening);
          expect(geometry.opaque.length).toBeGreaterThanOrEqual(36);
          for (const p of [...geometry.opaque, ...geometry.glass].flat())
            for (const axis of ["x", "y", "z"] as const) {
              expect(p[axis]).toBeGreaterThanOrEqual(0);
              expect(p[axis]).toBeLessThanOrEqual(1);
            }
        }
      }
  });
  it("retracts panels, retains window sills and distinguishes locks", () => {
    const base = { id: "test", facing: 0 as const, frameThickness: 1 / 8 };
    const open = terrainOpeningGeometry({
      ...base,
      kind: "door",
      state: "open",
    });
    const closed = terrainOpeningGeometry({
      ...base,
      kind: "door",
      state: "closed",
    });
    const locked = terrainOpeningGeometry({
      ...base,
      kind: "door",
      state: "locked",
    });
    expect(open.opaque).toHaveLength(36);
    // No frame triangle crosses the central passage.
    expect(
      open.opaque.every(
        (t) =>
          t.every((p) => p.x <= 0.125) ||
          t.every((p) => p.x >= 0.875) ||
          t.every((p) => p.z >= 0.875),
      ),
    ).toBe(true);
    expect(closed.opaque.length).toBeGreaterThan(open.opaque.length);
    expect(locked.opaque.length).toBeGreaterThan(closed.opaque.length);
    expect(
      terrainOpeningGeometry({ ...base, kind: "window", state: "open" }).opaque,
    ).toHaveLength(48);
    expect(
      terrainOpeningGeometry({ ...base, kind: "window", state: "open" }).glass,
    ).toHaveLength(0);
    expect(
      terrainOpeningGeometry({ ...base, kind: "window", state: "closed" })
        .glass,
    ).toHaveLength(12);
  });
});
