import type {
  CampaignCanvasLayerKey,
  CampaignLocationCanvasConfiguration,
  LocationId,
} from "@aow/common";

export type SessionCanvasLayerGroup =
  "scene" | "effects" | "visibility" | "interface";

export type SessionCanvasLayerKey = CampaignCanvasLayerKey;

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
