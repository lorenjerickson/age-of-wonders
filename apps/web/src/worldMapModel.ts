import type { JsonValue, WorldDraftRecord } from "./api";

export function locationWithMapScene(
  record: WorldDraftRecord,
  notes: string,
  orientation: string,
): WorldDraftRecord {
  const payload =
    record.payload &&
    typeof record.payload === "object" &&
    !Array.isArray(record.payload)
      ? record.payload
      : {};
  const scene =
    payload.mapScene &&
    typeof payload.mapScene === "object" &&
    !Array.isArray(payload.mapScene)
      ? payload.mapScene
      : {};
  const nextScene: Record<string, JsonValue> = { ...scene, notes };
  if (orientation) nextScene.orientation = orientation;
  else delete nextScene.orientation;
  return { ...record, payload: { ...payload, mapScene: nextScene } };
}
