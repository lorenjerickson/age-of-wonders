import type {
  CampaignCanvasLayerKey,
  CampaignLocationCanvasConfiguration,
  LocationId,
} from "@aow/common";

export type SessionCanvasLayerGroup =
  "scene" | "effects" | "visibility" | "interface";

export type SessionCanvasLayerKey = CampaignCanvasLayerKey;

export type SessionCanvasObjectKind =
  "token" | "wall" | "sound" | "light" | "note" | "drawing" | "template";

const OBJECT_KIND_BY_LAYER: Partial<
  Record<SessionCanvasLayerKey, SessionCanvasObjectKind>
> = {
  tokens: "token",
  walls: "wall",
  sounds: "sound",
  lighting: "light",
  notes: "note",
  drawings: "drawing",
  templates: "template",
};

const LAYER_BY_OBJECT_KIND: Record<
  SessionCanvasObjectKind | "vertex",
  SessionCanvasLayerKey
> = {
  token: "tokens",
  wall: "walls",
  vertex: "walls",
  sound: "sounds",
  light: "lighting",
  note: "notes",
  drawing: "drawings",
  template: "templates",
};

export function canvasObjectKindForLayer(
  layer: SessionCanvasLayerKey,
): SessionCanvasObjectKind | null {
  return OBJECT_KIND_BY_LAYER[layer] ?? null;
}

export function sessionCanvasLayerForSelection(selection: {
  kind: SessionCanvasObjectKind | "vertex" | "layer";
  key: string;
}): SessionCanvasLayerKey {
  return selection.kind === "layer"
    ? (selection.key as SessionCanvasLayerKey)
    : LAYER_BY_OBJECT_KIND[selection.kind];
}

export interface SessionCanvasSelectionKeys {
  activeTool: string;
  selectedTokenKey: string;
  selectedSoundKey: string;
}

export function transitionSessionCanvasSelection<
  Selection extends { kind: string; key: string },
>(
  current: SessionCanvasSelectionKeys,
  selection: Selection | null,
): SessionCanvasSelectionKeys & {
  selection: Selection | null;
  inspectorTab: "selection";
} {
  return {
    selection,
    inspectorTab: "selection",
    activeTool: selection ? "select" : current.activeTool,
    selectedTokenKey:
      selection?.kind === "token" ? selection.key : current.selectedTokenKey,
    selectedSoundKey:
      selection?.kind === "sound" ? selection.key : current.selectedSoundKey,
  };
}

export function tokenKeyForKeyboardMove(
  activeTool: string,
  selection: { kind: string; key: string } | null,
): string | null {
  return activeTool === "select" && selection?.kind === "token"
    ? selection.key
    : null;
}

export function withoutSessionCanvasPlayback<Playback>(
  playbackBySound: Readonly<Record<string, Playback>>,
  soundKey: string,
): Record<string, Playback> {
  const next = { ...playbackBySound };
  delete next[soundKey];
  return next;
}

export interface TokenDragInteraction {
  activeTool: string;
  sceneMode: "fixture" | "persisted";
}

/** Token movement is a selection interaction in both fixture and persisted scenes. */
export function canStartTokenDrag({
  activeTool,
}: TokenDragInteraction): boolean {
  return activeTool === "select";
}

export interface CanvasViewportTransform {
  pan: { x: number; y: number };
  zoom: number;
}

export interface SideOnCanvasPoint {
  x: number;
  y: number;
}

/** A wall-like segment that can support a token in a side-on location. */
export interface SideOnSupportSegment {
  start: SideOnCanvasPoint;
  end: SideOnCanvasPoint;
  blocksMovement: boolean;
  /** Open doors and equivalent passable segments cannot support tokens. */
  open?: boolean;
}

export interface SideOnGroundingResult {
  /** Canvas-space Y for the token's feet after gravity is resolved. */
  groundedY: number;
  /** Canvas-space distance fallen; always non-negative. */
  fallDistance: number;
}

const DEFAULT_MAX_SIDE_ON_FLOOR_SLOPE = 0.25;

/**
 * Returns the segment Y at an intersecting X when the segment is an eligible
 * side-on floor. A 0.25 slope permits gently uneven floors while excluding
 * walls and steep ramps from gravity support.
 */
export function sideOnSupportYAtX(
  segment: SideOnSupportSegment,
  x: number,
  maxSlope = DEFAULT_MAX_SIDE_ON_FLOOR_SLOPE,
): number | null {
  if (!segment.blocksMovement || segment.open === true) return null;

  const run = segment.end.x - segment.start.x;
  const rise = segment.end.y - segment.start.y;
  if (!Number.isFinite(run) || run === 0 || !Number.isFinite(rise)) return null;
  if (Math.abs(rise / run) > Math.max(0, maxSlope)) return null;

  const minimumX = Math.min(segment.start.x, segment.end.x);
  const maximumX = Math.max(segment.start.x, segment.end.x);
  if (!Number.isFinite(x) || x < minimumX || x > maximumX) return null;

  return segment.start.y + ((x - segment.start.x) / run) * rise;
}

/** Resolves gravity to the nearest eligible floor below a token's feet. */
export function groundSideOnPoint(options: {
  point: SideOnCanvasPoint;
  segments: readonly SideOnSupportSegment[];
  canvasBottom: number;
  maxFloorSlope?: number;
}): SideOnGroundingResult {
  let groundedY = options.canvasBottom;

  for (const segment of options.segments) {
    const supportY = sideOnSupportYAtX(
      segment,
      options.point.x,
      options.maxFloorSlope,
    );
    if (
      supportY !== null &&
      supportY >= options.point.y &&
      supportY < groundedY
    ) {
      groundedY = supportY;
    }
  }

  return {
    groundedY,
    fallDistance: Math.max(0, groundedY - options.point.y),
  };
}

/** Number of d4s incurred by a completed side-on fall. */
export function sideOnFallDamageDice(
  fallDistancePixels: number,
  pixelsPerFiveFeet: number,
): number {
  if (
    !Number.isFinite(fallDistancePixels) ||
    !Number.isFinite(pixelsPerFiveFeet) ||
    fallDistancePixels <= 0 ||
    pixelsPerFiveFeet <= 0
  ) {
    return 0;
  }

  const feetFallen = (fallDistancePixels / pixelsPerFiveFeet) * 5;
  return feetFallen <= 10 ? 0 : Math.floor(feetFallen / 10);
}

export function creatureTokenArtworkView(
  orientation: unknown,
  locationKind: string | null,
): "overhead" | "side-on" {
  if (orientation === "overhead") return "overhead";
  if (orientation === "side-on" || orientation === "scenic") return "side-on";
  return locationKind === "site" ? "overhead" : "side-on";
}

export interface TokenSelectionGeometry {
  center: SideOnCanvasPoint;
  bounds: SideOnCanvasPoint & { width: number; height: number };
  radius: number;
  resizeHandle: SideOnCanvasPoint;
}

/** World-space selection geometry relative to a token's persisted origin. */
export function tokenSelectionGeometry(
  artworkView: "overhead" | "side-on" | undefined,
  tokenScale = 1,
): TokenSelectionGeometry {
  const scale = Number.isFinite(tokenScale) && tokenScale > 0 ? tokenScale : 1;
  const sideOn = artworkView === "side-on";
  const width = 84 * scale;
  const height = 84 * scale;
  const center = { x: 0, y: sideOn ? -34 * scale : 0 };
  const bounds = {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
  return {
    center,
    bounds,
    radius: Math.max(width, height) / 2,
    resizeHandle: { x: bounds.x + bounds.width, y: bounds.y },
  };
}

/** Keeps token resizing continuous from the exact point where the handle was grabbed. */
export function tokenScaleFromResize(
  pointerDistance: number,
  initialPointerDistance: number,
  initialScale: number,
): number {
  if (
    !Number.isFinite(pointerDistance) ||
    !Number.isFinite(initialPointerDistance) ||
    !Number.isFinite(initialScale) ||
    pointerDistance < 0 ||
    initialPointerDistance <= 0 ||
    initialScale <= 0
  ) {
    return initialScale;
  }
  return Math.min(
    3,
    Math.max(0.5, initialScale * (pointerDistance / initialPointerDistance)),
  );
}

/** Keeps one canvas-space point fixed while changing the viewport zoom. */
export function zoomViewportAtPoint(
  viewport: CanvasViewportTransform,
  anchor: { x: number; y: number },
  nextZoom: number,
): CanvasViewportTransform {
  const worldPoint = {
    x: (anchor.x - viewport.pan.x) / viewport.zoom,
    y: (anchor.y - viewport.pan.y) / viewport.zoom,
  };
  return {
    zoom: nextZoom,
    pan: {
      x: anchor.x - worldPoint.x * nextZoom,
      y: anchor.y - worldPoint.y * nextZoom,
    },
  };
}

export interface SessionCanvasLayerDefinition {
  key: SessionCanvasLayerKey;
  label: string;
  group: SessionCanvasLayerGroup;
  description: string;
  graphical: boolean;
  defaultVisible: boolean;
}

/** Bottom-to-top compositing order for the experimental session canvas. */
export const SESSION_CANVAS_LAYERS: readonly SessionCanvasLayerDefinition[] = [
  {
    key: "background",
    label: "Background",
    group: "scene",
    description: "The scene image and base terrain.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "background-effects",
    label: "Background alterations",
    group: "effects",
    description:
      "Scene-wide tinting and environmental alterations below placeables.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "tiles",
    label: "Tiles",
    group: "scene",
    description:
      "Foreground props and terrain patches placed over the background.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "grid",
    label: "Grid",
    group: "interface",
    description: "Measurement grid aligned to scene coordinates.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "regions",
    label: "Regions",
    group: "scene",
    description: "Named areas that can supply triggers, terrain, and rules.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "drawings",
    label: "Drawings",
    group: "scene",
    description: "Freehand and shape annotations shared on the map.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "templates",
    label: "Templates",
    group: "scene",
    description: "Area-of-effect measurements such as bursts and cones.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "walls",
    label: "Walls & doors",
    group: "scene",
    description: "Movement, perception, sound, and environmental boundaries.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "tokens",
    label: "Tokens",
    group: "scene",
    description:
      "Creature and object representations with scene-local positions.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "sounds",
    label: "Ambient sounds",
    group: "scene",
    description:
      "Non-graphical positional audio emitters and listener falloff.",
    graphical: false,
    defaultVisible: true,
  },
  {
    key: "lighting",
    label: "Lighting controls",
    group: "scene",
    description: "Light-source placeables and their editable ranges.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "notes",
    label: "Notes",
    group: "scene",
    description: "GM-authored pins and scene references.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "controls",
    label: "Canvas controls",
    group: "interface",
    description: "Selection handles, rulers, waypoints, and drag affordances.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "special-effects",
    label: "Special effects",
    group: "effects",
    description: "Short-lived spell, impact, and interaction effects.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "illumination-effects",
    label: "Illumination",
    group: "effects",
    description: "Composited bright and dim light contribution.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "coloration-effects",
    label: "Coloration",
    group: "effects",
    description: "Colored-light and atmosphere contribution.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "darkness-effects",
    label: "Darkness",
    group: "effects",
    description: "Scene darkness and darkness-source composition.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "visibility",
    label: "Visibility & fog",
    group: "visibility",
    description: "Token vision, fog-of-war, and explored-area masking.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "particle-effects",
    label: "Particles",
    group: "effects",
    description: "General-purpose embers, motes, dust, and drifting particles.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "weather-effects",
    label: "Weather",
    group: "effects",
    description: "Rain, snow, ash, and other scene-wide weather systems.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "filter-effects",
    label: "Filter effects",
    group: "effects",
    description: "Final color grading, bloom, vignette, and post-processing.",
    graphical: true,
    defaultVisible: true,
  },
  {
    key: "interface",
    label: "Interface overlay",
    group: "interface",
    description: "Labels, targeting feedback, and player-facing HUD elements.",
    graphical: true,
    defaultVisible: true,
  },
] as const;

export type SessionCanvasLayerVisibility = Record<
  SessionCanvasLayerKey,
  boolean
>;

export function defaultSessionCanvasLayerVisibility(): SessionCanvasLayerVisibility {
  return Object.fromEntries(
    SESSION_CANVAS_LAYERS.map((layer) => [layer.key, layer.defaultVisible]),
  ) as SessionCanvasLayerVisibility;
}

export function defaultSessionCanvasLayerOpacity() {
  return Object.fromEntries(
    SESSION_CANVAS_LAYERS.map(({ key }) => [key, 1]),
  ) as Record<SessionCanvasLayerKey, number>;
}

export function defaultCampaignLocationCanvas(
  locationId: string,
): CampaignLocationCanvasConfiguration {
  return {
    locationId: locationId as LocationId,
    layers: SESSION_CANVAS_LAYERS.map(({ key, defaultVisible }) => ({
      key,
      visible: defaultVisible,
      opacity: 1,
    })),
  };
}

export function sessionCanvasLayerVisibility(
  configuration?: Pick<CampaignLocationCanvasConfiguration, "layers">,
): SessionCanvasLayerVisibility {
  const result = defaultSessionCanvasLayerVisibility();
  for (const layer of configuration?.layers ?? []) {
    if (layer.key in result && typeof layer.visible === "boolean") {
      result[layer.key] = layer.visible;
    }
  }
  return result;
}

export function sessionCanvasLayerOpacity(
  configuration?: Pick<CampaignLocationCanvasConfiguration, "layers">,
) {
  const result = defaultSessionCanvasLayerOpacity();
  for (const layer of configuration?.layers ?? []) {
    if (layer.key in result && Number.isFinite(layer.opacity)) {
      result[layer.key] = Math.max(0, Math.min(1, layer.opacity));
    }
  }
  return result;
}

export function visibleSessionCanvasLayers(
  visibility: SessionCanvasLayerVisibility,
) {
  return SESSION_CANVAS_LAYERS.filter((layer) => visibility[layer.key]);
}

export function spatialAudioGain(options: {
  source: { x: number; y: number };
  listener: { x: number; y: number };
  range: number;
  baseVolume: number;
  mode: "distance" | "constant";
}) {
  const distance = Math.hypot(
    options.source.x - options.listener.x,
    options.source.y - options.listener.y,
  );
  if (distance > options.range) return 0;
  if (options.mode === "constant") return options.baseVolume;
  return options.baseVolume * Math.max(0, 1 - distance / options.range);
}
