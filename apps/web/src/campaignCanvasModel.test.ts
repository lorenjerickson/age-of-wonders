import { describe, expect, it } from "vitest";
import type { JsonValue } from "./api";
import {
  canvasCollections,
  newCanvasEntry,
  patchLocationCanvas,
} from "./campaignCanvasModel";

describe("Campaign Location canvas edits", () => {
  it("updates only the selected canvas and preserves private data and opaque identities", () => {
    const original: Record<string, JsonValue>[] = [
      {
        locationId: "a",
        layers: [],
        notes: [
          {
            id: "stable",
            name: "Gate",
            text: "Secret",
            private: { hidden: true },
          },
        ],
        private: { captured: true },
      },
      { locationId: "b", layers: [], private: "untouched" },
    ];
    const changed = patchLocationCanvas(original, "a", {
      pixelsPerFiveFeet: 70,
    });
    expect(changed[0]).toEqual({ ...original[0], pixelsPerFiveFeet: 70 });
    expect(changed[1]).toBe(original[1]);
    expect(original[0]).not.toHaveProperty("pixelsPerFiveFeet");
  });
  it("adds configuration for another Location without discarding unknown entries", () => {
    const original = [
      { locationId: "a", layers: [{ key: "private-layer", private: true }] },
      "opaque",
    ];
    expect(patchLocationCanvas(original, "b", { notes: [] })).toEqual([
      ...original,
      { locationId: "b", layers: [], notes: [] },
    ]);
  });
  it("creates each supported component with normalized position and a supplied stable identity", () => {
    for (const collection of canvasCollections) {
      const entry = newCanvasEntry(collection, "stable");
      expect(entry).toMatchObject({
        id: "stable",
        position: { kind: "normalized-map", x: 0.5, y: 0.5 },
      });
      if (collection === "notes") expect(entry.text).toBe("");
      else expect(entry.radius).toBe(0.1);
    }
    expect(newCanvasEntry("soundSources", "sound")).toMatchObject({
      volume: 1,
      volumeMode: "distance",
      loop: true,
    });
  });
});
