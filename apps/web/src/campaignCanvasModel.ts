import type { CampaignCanvasLayerKey } from "@aow/common";
import type { JsonValue } from "./api";

export const canvasLayers = [
  "background",
  "background-effects",
  "tiles",
  "grid",
  "regions",
  "drawings",
  "templates",
  "walls",
  "tokens",
  "sounds",
  "lighting",
  "notes",
  "controls",
  "special-effects",
  "illumination-effects",
  "coloration-effects",
  "darkness-effects",
  "visibility",
  "particle-effects",
  "weather-effects",
  "filter-effects",
  "interface",
] as const satisfies readonly CampaignCanvasLayerKey[];
export const canvasCollections = [
  "lightSources",
  "soundSources",
  "drawings",
  "templates",
  "notes",
] as const;
export type CanvasCollection = (typeof canvasCollections)[number];
export const canvasObject = (
  value: JsonValue | undefined,
): Record<string, JsonValue> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const canvasArray = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? value : [];

/** Replace only the selected Location, retaining private fields and unrecognized entries. */
export function patchLocationCanvas(
  canvases: readonly JsonValue[],
  locationId: string,
  patch: Record<string, JsonValue>,
): JsonValue[] {
  const index = canvases.findIndex(
    (value) => canvasObject(value).locationId === locationId,
  );
  if (index < 0) return [...canvases, { locationId, layers: [], ...patch }];
  return canvases.map((value, i) =>
    i === index ? { ...canvasObject(value), ...patch } : value,
  );
}

export function newCanvasEntry(
  collection: CanvasCollection,
  id: string,
): Record<string, JsonValue> {
  const entry = {
    id,
    name: "",
    position: { kind: "normalized-map", x: 0.5, y: 0.5 },
  };
  switch (collection) {
    case "lightSources":
      return { ...entry, radius: 0.1, color: "#ffffff" };
    case "soundSources":
      return {
        ...entry,
        radius: 0.1,
        volume: 1,
        volumeMode: "distance",
        loop: true,
      };
    case "notes":
      return { ...entry, text: "" };
    default:
      return { ...entry, radius: 0.1 };
  }
}
