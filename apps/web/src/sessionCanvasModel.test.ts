import { describe, expect, it } from "vitest";
import {
  canStartTokenDrag,
  canvasObjectKindForLayer,
  creatureTokenArtworkView,
  defaultCampaignLocationCanvas,
  defaultSessionCanvasLayerVisibility,
  groundSideOnPoint,
  sessionCanvasLayerOpacity,
  sessionCanvasLayerVisibility,
  SESSION_CANVAS_LAYERS,
  sideOnFallDamageDice,
  sideOnSupportYAtX,
  spatialAudioGain,
  sessionCanvasLayerForSelection,
  tokenKeyForKeyboardMove,
  tokenScaleFromResize,
  tokenSelectionGeometry,
  transitionSessionCanvasSelection,
  visibleSessionCanvasLayers,
  withoutSessionCanvasPlayback,
  zoomViewportAtPoint,
} from "./sessionCanvasModel";

describe("session canvas layer model", () => {
  it("maps authored-object selections to their owning canvas layers", () => {
    const mappings = [
      ["token", "tokens"],
      ["wall", "walls"],
      ["vertex", "walls"],
      ["sound", "sounds"],
      ["light", "lighting"],
      ["note", "notes"],
      ["drawing", "drawings"],
      ["template", "templates"],
    ] as const;
    for (const [kind, layer] of mappings) {
      expect(sessionCanvasLayerForSelection({ kind, key: "object-1" })).toBe(
        layer,
      );
    }

    expect(canvasObjectKindForLayer("tokens")).toBe("token");
    expect(canvasObjectKindForLayer("walls")).toBe("wall");
    expect(canvasObjectKindForLayer("sounds")).toBe("sound");
    expect(canvasObjectKindForLayer("lighting")).toBe("light");
    expect(canvasObjectKindForLayer("background")).toBeNull();

    expect(
      sessionCanvasLayerForSelection({ kind: "note", key: "note-1" }),
    ).toBe("notes");
    expect(sessionCanvasLayerForSelection({ kind: "layer", key: "grid" })).toBe(
      "grid",
    );
  });

  it("centralizes object and layer selection while synchronizing source keys", () => {
    const sound = transitionSessionCanvasSelection(
      {
        activeTool: "sound",
        selectedTokenKey: "token-1",
        selectedSoundKey: "sound-1",
      },
      { kind: "sound", key: "sound-2" },
    );
    expect(sound).toEqual({
      selection: { kind: "sound", key: "sound-2" },
      inspectorTab: "selection",
      activeTool: "select",
      selectedTokenKey: "token-1",
      selectedSoundKey: "sound-2",
    });

    expect(
      transitionSessionCanvasSelection(sound, {
        kind: "token",
        key: "token-2",
      }),
    ).toMatchObject({
      selection: { kind: "token", key: "token-2" },
      inspectorTab: "selection",
      selectedTokenKey: "token-2",
      selectedSoundKey: "sound-2",
    });
  });

  it("moves a token by keyboard only when that token is currently selected", () => {
    expect(
      tokenKeyForKeyboardMove("select", { kind: "token", key: "token-2" }),
    ).toBe("token-2");
    expect(
      tokenKeyForKeyboardMove("select", { kind: "sound", key: "sound-1" }),
    ).toBeNull();
    expect(
      tokenKeyForKeyboardMove("pan", { kind: "token", key: "token-2" }),
    ).toBeNull();
  });

  it("removes only the deleted sound playback from immutable state", () => {
    const playback = {
      "sound-1": { url: "blob:one" },
      "sound-2": { url: "blob:two" },
    };

    expect(withoutSessionCanvasPlayback(playback, "sound-1")).toEqual({
      "sound-2": { url: "blob:two" },
    });
    expect(playback).toHaveProperty("sound-1");
  });

  it("only permits the selection tool to drag tokens in a persisted scene", () => {
    expect(
      canStartTokenDrag({ activeTool: "select", sceneMode: "persisted" }),
    ).toBe(true);
    expect(
      canStartTokenDrag({ activeTool: "pan", sceneMode: "persisted" }),
    ).toBe(false);
    expect(
      canStartTokenDrag({ activeTool: "token", sceneMode: "persisted" }),
    ).toBe(false);
  });

  it("selects creature token artwork from the map perspective", () => {
    expect(creatureTokenArtworkView("overhead", "site")).toBe("overhead");
    expect(creatureTokenArtworkView("side-on", "site")).toBe("side-on");
    expect(creatureTokenArtworkView("scenic", "site")).toBe("side-on");
    expect(creatureTokenArtworkView(undefined, "site")).toBe("overhead");
  });

  it("centers and scales side-on token selection geometry once", () => {
    expect(tokenSelectionGeometry("side-on", 1)).toEqual({
      center: { x: 0, y: -34 },
      bounds: { x: -42, y: -76, width: 84, height: 84 },
      radius: 42,
      resizeHandle: { x: 42, y: -76 },
    });
    expect(tokenSelectionGeometry("side-on", 0.5)).toEqual({
      center: { x: 0, y: -17 },
      bounds: { x: -21, y: -38, width: 42, height: 42 },
      radius: 21,
      resizeHandle: { x: 21, y: -38 },
    });
    expect(tokenSelectionGeometry("side-on", 2)).toEqual({
      center: { x: 0, y: -68 },
      bounds: { x: -84, y: -152, width: 168, height: 168 },
      radius: 84,
      resizeHandle: { x: 84, y: -152 },
    });
  });

  it("keeps overhead selection centered while scaling it", () => {
    expect(tokenSelectionGeometry("overhead", 1.5)).toEqual({
      center: { x: 0, y: 0 },
      bounds: { x: -63, y: -63, width: 126, height: 126 },
      radius: 63,
      resizeHandle: { x: 63, y: -63 },
    });
  });

  it.each([0.5, 1, 2])(
    "keeps scale %s stable when a resize begins without pointer movement",
    (scale) => {
      const geometry = tokenSelectionGeometry("side-on", scale);
      const pointerDistance = Math.hypot(
        geometry.resizeHandle.x,
        geometry.resizeHandle.y,
      );
      const nextScale = tokenScaleFromResize(
        pointerDistance * 1.5,
        pointerDistance,
        scale,
      );
      const nextGeometry = tokenSelectionGeometry("side-on", nextScale);

      expect(tokenScaleFromResize(pointerDistance, pointerDistance, scale)).toBe(
        scale,
      );
      expect(nextScale).toBeCloseTo(Math.min(3, scale * 1.5));
      expect(nextGeometry.resizeHandle.x).toBeCloseTo(
        geometry.resizeHandle.x * (nextScale / scale),
      );
      expect(nextGeometry.resizeHandle.y).toBeCloseTo(
        geometry.resizeHandle.y * (nextScale / scale),
      );
    },
  );

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

  it("keeps the point beneath the cursor fixed while zooming", () => {
    const anchor = { x: 640, y: 360 };
    const next = zoomViewportAtPoint(
      { pan: { x: 80, y: -20 }, zoom: 1.25 },
      anchor,
      2,
    );
    const worldPoint = {
      x: (anchor.x - 80) / 1.25,
      y: (anchor.y + 20) / 1.25,
    };

    expect(next.pan.x + worldPoint.x * next.zoom).toBeCloseTo(anchor.x);
    expect(next.pan.y + worldPoint.y * next.zoom).toBeCloseTo(anchor.y);
  });
});

describe("side-on gravity", () => {
  const floor = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    overrides: Partial<{
      blocksMovement: boolean;
      open: boolean;
    }> = {},
  ) => ({
    start,
    end,
    blocksMovement: true,
    ...overrides,
  });

  it("grounds on the nearest eligible floor below the point", () => {
    expect(
      groundSideOnPoint({
        point: { x: 50, y: 100 },
        segments: [
          floor({ x: 0, y: 300 }, { x: 100, y: 300 }),
          floor({ x: 0, y: 180 }, { x: 100, y: 180 }),
        ],
        canvasBottom: 500,
      }),
    ).toEqual({ groundedY: 180, fallDistance: 80 });
  });

  it("ignores floors that do not intersect the point's x coordinate", () => {
    expect(
      groundSideOnPoint({
        point: { x: 150, y: 100 },
        segments: [floor({ x: 0, y: 180 }, { x: 100, y: 180 })],
        canvasBottom: 500,
      }),
    ).toEqual({ groundedY: 500, fallDistance: 400 });
  });

  it("ignores nonblocking and open segments", () => {
    expect(
      groundSideOnPoint({
        point: { x: 50, y: 100 },
        segments: [
          floor(
            { x: 0, y: 160 },
            { x: 100, y: 160 },
            { blocksMovement: false },
          ),
          floor({ x: 0, y: 180 }, { x: 100, y: 180 }, { open: true }),
        ],
        canvasBottom: 500,
      }),
    ).toEqual({ groundedY: 500, fallDistance: 400 });
  });

  it("interpolates the support height of a slightly sloped floor", () => {
    const segment = floor({ x: 0, y: 180 }, { x: 100, y: 200 });

    expect(sideOnSupportYAtX(segment, 25)).toBe(185);
    expect(
      groundSideOnPoint({
        point: { x: 25, y: 100 },
        segments: [segment],
        canvasBottom: 500,
      }),
    ).toEqual({ groundedY: 185, fallDistance: 85 });
  });

  it("falls back to the canvas bottom when no segment is eligible", () => {
    expect(
      groundSideOnPoint({
        point: { x: 50, y: 120 },
        segments: [floor({ x: 50, y: 100 }, { x: 50, y: 300 })],
        canvasBottom: 720,
      }),
    ).toEqual({ groundedY: 720, fallDistance: 600 });
  });

  it("calculates one d4 per completed ten feet only beyond ten feet", () => {
    const pixelsPerFiveFeet = 25;

    expect(sideOnFallDamageDice(50, pixelsPerFiveFeet)).toBe(0);
    expect(sideOnFallDamageDice(50.1, pixelsPerFiveFeet)).toBe(1);
    expect(sideOnFallDamageDice(99.9, pixelsPerFiveFeet)).toBe(1);
    expect(sideOnFallDamageDice(100, pixelsPerFiveFeet)).toBe(2);
    expect(sideOnFallDamageDice(150, pixelsPerFiveFeet)).toBe(3);
  });
});
