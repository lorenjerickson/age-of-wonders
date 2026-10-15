type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const named = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim() && value.length <= 240;
export function locationPresentationIssue(
  data: ObjectValue,
  baseline?: ObjectValue,
): string | undefined {
  const changed = (field: string) =>
    !baseline ||
    JSON.stringify(data[field]) !== JSON.stringify(baseline[field]);
  if (data.weather !== undefined && changed("weather")) {
    const w = data.weather;
    if (!object(w) || !named(w.condition))
      return "Weather requires a condition description.";
    if (w.temperatureCelsius !== undefined && !finite(w.temperatureCelsius))
      return "Weather temperature must be a finite number.";
    if (
      w.wind !== undefined &&
      (!object(w.wind) ||
        !finite(w.wind.speedKph) ||
        w.wind.speedKph < 0 ||
        (w.wind.directionDegrees !== undefined &&
          (!finite(w.wind.directionDegrees) ||
            w.wind.directionDegrees < 0 ||
            w.wind.directionDegrees >= 360)))
    )
      return "Wind requires a nonnegative speed and an optional direction from 0 to less than 360 degrees.";
  }
  if (data.audiovisualEffects !== undefined && changed("audiovisualEffects")) {
    if (
      !Array.isArray(data.audiovisualEffects) ||
      data.audiovisualEffects.length > 100
    )
      return "Provide at most 100 audiovisual cues.";
    const ids = new Set<string>();
    for (const cue of data.audiovisualEffects) {
      if (
        !object(cue) ||
        !named(cue.id) ||
        ids.has(cue.id) ||
        !named(cue.name) ||
        !named(cue.assetId) ||
        !["audio", "visual"].includes(String(cue.kind)) ||
        typeof cue.enabled !== "boolean" ||
        typeof cue.loop !== "boolean"
      )
        return "Each audiovisual cue requires a unique identity, name, media asset, kind, enabled state and loop setting.";
      ids.add(cue.id);
      for (const field of ["volume", "opacity"])
        if (
          cue[field] !== undefined &&
          (!finite(cue[field]) || cue[field] < 0 || cue[field] > 1)
        )
          return "Cue volume and opacity must be between 0 and 1.";
      if (cue.kind === "audio" && cue.opacity !== undefined)
        return "Opacity belongs to visual cues.";
      if (cue.kind === "visual" && cue.volume !== undefined)
        return "Volume belongs to audio cues.";
    }
  }
}
export function withLocationPresentation(
  data: ObjectValue,
  changes: ObjectValue,
): ObjectValue {
  const next = { ...data };
  for (const field of ["weather", "audiovisualEffects"]) {
    if (changes[field] === null) delete next[field];
    else if (changes[field] !== undefined) next[field] = changes[field];
  }
  const extras = (value: unknown, known: readonly string[]) =>
    Object.fromEntries(
      Object.entries(object(value) ? value : {}).filter(
        ([key]) => !known.includes(key),
      ),
    );
  if (object(changes.weather)) {
    const weather = changes.weather;
    next.weather = {
      ...extras(data.weather, ["condition", "temperatureCelsius", "wind"]),
      ...weather,
    };
    if (object(weather.wind))
      (next.weather as ObjectValue).wind = {
        ...extras(object(data.weather) ? data.weather.wind : undefined, [
          "speedKph",
          "directionDegrees",
        ]),
        ...weather.wind,
      };
  }
  if (Array.isArray(changes.audiovisualEffects)) {
    const previous = Array.isArray(data.audiovisualEffects)
      ? data.audiovisualEffects
      : [];
    next.audiovisualEffects = changes.audiovisualEffects.map((cue: unknown) =>
      object(cue)
        ? {
            ...extras(
              previous.find(
                (value: unknown) => object(value) && value.id === cue.id,
              ),
              [
                "id",
                "name",
                "kind",
                "assetId",
                "enabled",
                "loop",
                "volume",
                "opacity",
                "uri",
              ],
            ),
            ...cue,
          }
        : cue,
    );
  }
  const issue = locationPresentationIssue(next, data);
  if (issue) throw new TypeError(issue);
  return next;
}
