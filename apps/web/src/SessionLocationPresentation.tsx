import { useEffect, useRef, useState } from "react";
import { Alert, Button, Details, Input, Label, Summary } from "@aow/ui";
import type {
  CampaignSessionTableProjection,
  LocationAudiovisualEffect,
  LocationWeather,
} from "@aow/common";
import {
  changeSessionLocationWeather,
  getMediaAsset,
  getMediaDownloadUrl,
} from "./api";

function Cue({ cue }: { cue: LocationAudiovisualEffect }) {
  const [media, setMedia] = useState<{ url: string; mime: string }>();
  const [failed, setFailed] = useState(false);
  const player = useRef<HTMLMediaElement | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([
      getMediaAsset(cue.assetId),
      getMediaDownloadUrl(cue.assetId),
    ]).then(
      ([asset, download]) => {
        if (active) setMedia({ url: download.url, mime: asset.mimeType });
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
      player.current?.pause();
    };
  }, [cue.assetId]);
  useEffect(() => {
    if (player.current && cue.kind === "audio")
      player.current.volume = cue.volume ?? 1;
  }, [media, cue.volume, cue.kind]);
  return (
    <li className="space-y-2">
      <p className="font-medium">{cue.name || "Location cue"}</p>
      {failed ? (
        <p>Media unavailable.</p>
      ) : !media ? (
        <p role="status">Loading media…</p>
      ) : cue.kind === "audio" && media.mime.startsWith("audio/") ? (
        <audio
          ref={(node) => {
            player.current = node;
          }}
          controls
          loop={cue.loop}
          preload="none"
          src={media.url}
          className="w-full"
          aria-label={cue.name}
        />
      ) : cue.kind === "visual" && media.mime.startsWith("video/") ? (
        <video
          ref={(node) => {
            player.current = node;
          }}
          controls
          loop={cue.loop}
          preload="metadata"
          src={media.url}
          style={{ opacity: cue.opacity ?? 1 }}
          className="max-w-full"
          aria-label={cue.name}
        />
      ) : cue.kind === "visual" && media.mime.startsWith("image/") ? (
        <img
          src={media.url}
          alt={cue.name}
          style={{ opacity: cue.opacity ?? 1 }}
          className="max-w-full"
        />
      ) : (
        <p>Media format unavailable.</p>
      )}
    </li>
  );
}
export function SessionLocationPresentation({
  campaignId,
  instanceId,
  sessionId,
  location,
  runtimeRevision,
  onSaved,
}: {
  campaignId: string;
  instanceId: string;
  sessionId: string;
  location: NonNullable<CampaignSessionTableProjection["location"]>;
  runtimeRevision: number;
  onSaved: () => void;
}) {
  const [condition, setCondition] = useState(location.weather?.condition ?? "");
  const [temperature, setTemperature] = useState(
    String(location.weather?.temperatureCelsius ?? ""),
  );
  const [speed, setSpeed] = useState(
    String(location.weather?.wind?.speedKph ?? ""),
  );
  const [direction, setDirection] = useState(
    String(location.weather?.wind?.directionDegrees ?? ""),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(weather?: LocationWeather | null, reset = false) {
    setBusy(true);
    setError("");
    try {
      const updated = await changeSessionLocationWeather(
        campaignId,
        instanceId,
        sessionId,
        {
          locationId: location.id,
          expectedRuntimeRevision: runtimeRevision,
          ...(reset ? { reset: true } : { weather }),
        },
      );
      setCondition(updated.location?.weather?.condition ?? "");
      setTemperature(
        String(updated.location?.weather?.temperatureCelsius ?? ""),
      );
      setSpeed(String(updated.location?.weather?.wind?.speedKph ?? ""));
      setDirection(
        String(updated.location?.weather?.wind?.directionDegrees ?? ""),
      );
      onSaved();
    } catch {
      setError(
        "Weather was not saved. Refresh the table and retry if it changed elsewhere.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Details>
      <Summary className="min-h-11">Weather and media</Summary>
      <div className="mt-3 space-y-4">
        <p>
          {location.weather?.condition || "No weather specified"}
          {location.weatherOverridden
            ? " · Instance override"
            : " · Captured default"}
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save({
              condition,
              ...(temperature !== ""
                ? { temperatureCelsius: Number(temperature) }
                : {}),
              ...(speed !== ""
                ? {
                    wind: {
                      speedKph: Number(speed),
                      ...(direction !== ""
                        ? { directionDegrees: Number(direction) }
                        : {}),
                    },
                  }
                : {}),
            });
          }}
        >
          <Label>
            Condition
            <Input
              className="mt-1 min-h-11 w-full"
              value={condition}
              maxLength={240}
              required
              onChange={(event) => setCondition(event.currentTarget.value)}
            />
          </Label>
          <Label>
            Temperature (°C)
            <Input
              className="mt-1 min-h-11 w-full"
              type="number"
              step="any"
              value={temperature}
              onChange={(event) => setTemperature(event.currentTarget.value)}
            />
          </Label>
          <Label>
            Wind speed (km/h)
            <Input
              className="mt-1 min-h-11 w-full"
              type="number"
              min={0}
              step="any"
              value={speed}
              onChange={(event) => setSpeed(event.currentTarget.value)}
            />
          </Label>
          <Label>
            Wind direction (degrees)
            <Input
              className="mt-1 min-h-11 w-full"
              type="number"
              min={0}
              max={359.999}
              step="any"
              disabled={!speed}
              value={direction}
              onChange={(event) => setDirection(event.currentTarget.value)}
            />
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              type="submit"
              disabled={busy || !condition.trim()}
            >
              Save weather
            </Button>
            <Button
              className="min-h-11"
              type="button"
              disabled={busy}
              onClick={() => void save(null)}
            >
              Clear weather
            </Button>
            <Button
              className="min-h-11"
              type="button"
              disabled={busy || !location.weatherOverridden}
              onClick={() => void save(undefined, true)}
            >
              Restore captured weather
            </Button>
          </div>
        </form>
        <ul className="space-y-4">
          {location.audiovisualEffects
            ?.filter((cue) => cue.enabled)
            .map((cue) => (
              <Cue key={`${cue.id}:${cue.assetId}`} cue={cue} />
            ))}
        </ul>
      </div>
    </Details>
  );
}
