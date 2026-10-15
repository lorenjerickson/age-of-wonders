import type { JsonValue } from "./api";
export type PresentationObject = Record<string, JsonValue>;
export function presentationObject(
  value: unknown,
): value is PresentationObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function presentationFields(
  weather: JsonValue | undefined,
  audiovisualEffects: JsonValue | undefined,
  baseline?: { weather?: unknown; audiovisualEffects?: unknown },
): Record<string, JsonValue> {
  const changed = (
    key: "weather" | "audiovisualEffects",
    value: JsonValue | undefined,
  ) =>
    value !== undefined &&
    (!baseline || JSON.stringify(value) !== JSON.stringify(baseline[key]));
  return {
    ...(changed("weather", weather) ? { weather: weather! } : {}),
    ...(changed("audiovisualEffects", audiovisualEffects)
      ? { audiovisualEffects: audiovisualEffects! }
      : {}),
  };
}
/** Change only a selected authored field; imported keys belong to their owner. */
export function presentationField(
  value: PresentationObject,
  key: string,
  next: JsonValue | undefined,
): PresentationObject {
  const result = { ...value };
  if (next === undefined) delete result[key];
  else result[key] = next;
  return result;
}
export function presentationEntries(
  value: unknown,
): PresentationObject[] | undefined {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        !presentationObject(entry) ||
        typeof entry.id !== "string" ||
        !entry.id ||
        !["audio", "visual"].includes(String(entry.kind)),
    )
  )
    return undefined;
  const entries = value as PresentationObject[];
  return new Set(entries.map((entry) => entry.id)).size === entries.length
    ? entries
    : undefined;
}
