import { describe, expect, it } from "vitest";
import {
  defaultCampaignLocationCanvas,
  defaultSessionCanvasLayerVisibility,
  sessionCanvasLayerOpacity,
  sessionCanvasLayerVisibility,
  SESSION_CANVAS_LAYERS,
  spatialAudioGain,
  visibleSessionCanvasLayers,
} from "./sessionCanvasModel";

describe("session canvas layer model", () => {
  it("creates persisted defaults for a campaign location", () => {
    const configuration = defaultCampaignLocationCanvas("location-1");

    expect(configuration.locationId).toBe("location-1");
    expect(configuration.layers).toHaveLength(SESSION_CANVAS_LAYERS.length);
    expect(configuration.layers.every((layer) => layer.visible)).toBe(true);
    expect(configuration.layers.every((layer) => layer.opacity === 1)).toBe(
      true,
    );
  });

  it("hydrates legacy and partial layer configuration with safe defaults", () => {
    const configuration = {
      locationId: "location-1",
      layers: [
        { key: "grid", visible: false, opacity: 0.35 },
        { key: "weather-effects", visible: true, opacity: 4 },
      ],
    } as const;

    expect(sessionCanvasLayerVisibility(configuration).grid).toBe(false);
    expect(sessionCanvasLayerVisibility(configuration).tokens).toBe(true);
    expect(sessionCanvasLayerOpacity(configuration).grid).toBe(0.35);
    expect(sessionCanvasLayerOpacity(configuration)["weather-effects"]).toBe(1);
    expect(sessionCanvasLayerOpacity(configuration).tokens).toBe(1);
  });

  it("defines every layer key once in bottom-to-top order", () => {
    const keys = SESSION_CANVAS_LAYERS.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.indexOf("background")).toBeLessThan(keys.indexOf("tokens"));
    expect(keys.indexOf("tokens")).toBeLessThan(keys.indexOf("visibility"));
    expect(keys.at(-1)).toBe("interface");
  });

  it("keeps non-graphical simulation layers first-class", () => {
    expect(
      SESSION_CANVAS_LAYERS.find(({ key }) => key === "sounds")?.graphical,
    ).toBe(false);
  });

  it("filters disabled layers without changing compositing order", () => {
    const visibility = defaultSessionCanvasLayerVisibility();
    visibility.grid = false;
    visibility["weather-effects"] = false;
    const visible = visibleSessionCanvasLayers(visibility);
    expect(visible.some(({ key }) => key === "grid")).toBe(false);
    expect(visible.some(({ key }) => key === "weather-effects")).toBe(false);
    expect(visible[0]?.key).toBe("background");
  });

  it("stops positional audio outside its effective range", () => {
    expect(
      spatialAudioGain({
        source: { x: 0, y: 0 },
        listener: { x: 101, y: 0 },
        range: 100,
        baseVolume: 0.8,
        mode: "constant",
      }),
    ).toBe(0);
  });

  it("supports constant and distance-scaled volume inside range", () => {
    const shared = {
      source: { x: 0, y: 0 },
      listener: { x: 50, y: 0 },
      range: 100,
      baseVolume: 0.8,
    };
    expect(spatialAudioGain({ ...shared, mode: "constant" })).toBe(0.8);
    expect(spatialAudioGain({ ...shared, mode: "distance" })).toBeCloseTo(0.4);
  });
});
