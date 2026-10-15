import { useEffect, useState } from "react";
import { getMediaAsset, type JsonValue } from "./api";
import {
  presentationEntries,
  presentationObject,
} from "./locationPresentationModel";
import { protectedComparisonText } from "./protectedAuthoringText";
export function PresentationMediaName({ assetId }: { assetId: unknown }) {
  const [resolved, setResolved] = useState<{ id: string; name: string }>();
  useEffect(() => {
    let active = true;
    if (typeof assetId === "string" && assetId)
      void getMediaAsset(assetId).then(
        (asset) => {
          if (active)
            setResolved({
              id: assetId,
              name:
                typeof asset.originalName === "string" &&
                !protectedComparisonText(asset.originalName, new Set([assetId]))
                  ? asset.originalName
                  : "Media attached",
            });
        },
        () => {
          if (active) setResolved({ id: assetId, name: "Media unavailable" });
        },
      );
    return () => {
      active = false;
    };
  }, [assetId]);
  return (
    <span>
      {!assetId
        ? "Choose media for this effect"
        : resolved?.id === assetId
          ? resolved.name
          : "Media attached"}
    </span>
  );
}
export function LocationPresentationSummary({
  weather,
  audiovisualEffects,
}: {
  weather: unknown;
  audiovisualEffects: unknown;
}) {
  const current = presentationObject(weather) ? weather : undefined;
  const entries = presentationEntries(audiovisualEffects);
  if (weather == null && (!entries || entries.length === 0)) return null;
  const ids = new Set(
    entries?.flatMap((entry) => [
      String(entry.id),
      String(entry.assetId ?? ""),
    ]) ?? [],
  );
  const label = (value: JsonValue | undefined, fallback: string) =>
    typeof value === "string" &&
    value.trim() &&
    !protectedComparisonText(value, ids)
      ? value
      : fallback;
  const wind =
    current && presentationObject(current.wind) ? current.wind : undefined;
  return (
    <section
      className="astra-panel mt-6 space-y-3 p-5"
      aria-label="Location presentation"
    >
      <h2>Location presentation</h2>
      {current && (
        <div>
          <h3>Weather</h3>
          <p>
            {label(current.condition, "Weather configured")}
            {typeof current.temperatureCelsius === "number"
              ? ` · ${current.temperatureCelsius} °C`
              : ""}
          </p>
          {wind && typeof wind.speedKph === "number" && (
            <p>
              Wind {wind.speedKph} km/h
              {typeof wind.directionDegrees === "number"
                ? ` · ${wind.directionDegrees}°`
                : ""}
            </p>
          )}
        </div>
      )}
      {!!entries?.length && (
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <li key={String(entry.id)}>
              <strong>{label(entry.name, `Effect ${index + 1}`)}</strong>
              <p>
                {entry.kind === "audio" ? "Audio" : "Visual"} ·{" "}
                {entry.enabled ? "Enabled" : "Disabled"}
                {entry.loop ? " · Loop" : ""}
                {typeof entry.volume === "number"
                  ? ` · Volume ${entry.volume}`
                  : ""}
                {typeof entry.opacity === "number"
                  ? ` · Opacity ${entry.opacity}`
                  : ""}
              </p>
              <PresentationMediaName assetId={entry.assetId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
