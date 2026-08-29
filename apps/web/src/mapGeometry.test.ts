import { describe, expect, it } from "vitest";
import {
  alignToGravity,
  intersectingTransition,
  visibilityPolygon,
} from "./mapGeometry";

describe("map decorator geometry", () => {
  it("stops visibility rays at sight-blocking walls", () => {
    const polygon = visibilityPolygon({ x: 0.25, y: 0.5 }, [
      { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
    ]);
    expect(Math.max(...polygon.map(({ x }) => x))).toBeCloseTo(0.5, 4);
    expect(Math.min(...polygon.map(({ x }) => x))).toBeCloseTo(0, 4);
  });

  it("drops side-on tokens to the nearest horizontal wall below them", () => {
    const aligned = alignToGravity({ x: 0.4, y: 0.1 }, [
      { start: { x: 0.2, y: 0.7 }, end: { x: 0.8, y: 0.7 } },
      { start: { x: 0.2, y: 0.4 }, end: { x: 0.8, y: 0.4 } },
    ]);
    expect(aligned).toEqual({ x: 0.4, y: 0.4 });
  });

  it("falls to the map boundary when no horizontal wall catches the token", () => {
    expect(
      alignToGravity({ x: 0.4, y: 0.1 }, [
        { start: { x: 0.4, y: 0.2 }, end: { x: 0.4, y: 0.9 } },
      ]),
    ).toEqual({ x: 0.4, y: 1 });
  });

  it("keeps a falling token within the background image", () => {
    expect(alignToGravity({ x: 0.4, y: 0.95 }, [])).toEqual({ x: 0.4, y: 1 });
  });

  it("detects when a token intersects a transition trigger", () => {
    const transition = {
      position: { x: 0.5, y: 0.5 },
      radius: 0.02,
      destination: "next map",
    };
    expect(
      intersectingTransition({ x: 0.54, y: 0.5 }, 0.025, [transition]),
    ).toBe(transition);
    expect(
      intersectingTransition({ x: 0.6, y: 0.5 }, 0.025, [transition]),
    ).toBeUndefined();
  });
});
