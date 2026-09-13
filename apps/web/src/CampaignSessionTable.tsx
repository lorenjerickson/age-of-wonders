import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CampaignSessionTableProjection,
  CampaignSessionTablePlot,
  LocationImage,
} from "@aow/common";
import { Badge, Button, Label, Select } from "@aow/ui";
import {
  ApiRequestError,
  getCampaignSessionTable,
  getMediaDownloadUrl,
} from "./api";
import { dateLabel, statusLabel } from "./campaignLibraryModel";
import { ZoomableImage } from "./ZoomableImage";
import { CampaignSessionTerrainOverview } from "./CampaignSessionTerrainOverview";

function CapturedMapImage({
  image,
  name,
}: {
  image: LocationImage;
  name: string;
}) {
  const [preview, setPreview] = useState<{
    assetId: string;
    url?: string;
    failed?: boolean;
  }>();
  useEffect(() => {
    let current = true;
    void getMediaDownloadUrl(image.assetId).then(
      ({ url }) => {
        if (current) setPreview({ assetId: image.assetId, url });
      },
      () => {
        if (current) setPreview({ assetId: image.assetId, failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, [image.assetId]);
  const result = preview?.assetId === image.assetId ? preview : undefined;
  return result?.url && !result.failed ? (
    <ZoomableImage
      src={result.url}
      alt={image.altText?.trim() || `${name} map`}
      className="max-h-[36rem] min-h-64 w-full object-contain"
      onError={() => setPreview({ assetId: image.assetId, failed: true })}
    />
  ) : (
    <p
      className="grid min-h-64 place-items-center p-8 text-sm opacity-65"
      role="status"
    >
      {result?.failed
        ? "The captured map image is unavailable."
        : "Loading captured map…"}
    </p>
  );
}

function PlotCue({
  plot,
  showFocus,
}: {
  plot: CampaignSessionTablePlot;
  showFocus: boolean;
}) {
  return (
    <li className="min-w-0 rounded-box border border-base-300 bg-base-100 p-4">
      <details open>
        <summary className="cursor-pointer font-semibold">
          {plot.name.trim() || "Unnamed Plot"}{" "}
          <Badge className="ml-2" outline>
            {statusLabel(plot.status)}
          </Badge>
          {showFocus && plot.atFocusedLocation && (
            <span className="ml-2 text-xs font-normal text-secondary">
              At viewed Location
            </span>
          )}
        </summary>
        <div className="mt-3 grid gap-4 text-sm">
          {plot.description && (
            <p className="whitespace-pre-wrap opacity-75">{plot.description}</p>
          )}
          {plot.locationNames.length > 0 && (
            <p className="opacity-60">
              Locations: {plot.locationNames.join(", ")}
            </p>
          )}
          {plot.objectives.length > 0 && (
            <section aria-label={`${plot.name || "Plot"} objectives`}>
              <h4 className="font-semibold">Objectives</h4>
              <ul className="mt-2 grid gap-2">
                {plot.objectives.map((objective, index) => (
                  <li key={index}>
                    <span className="font-medium">
                      {objective.name || "Unnamed objective"}
                    </span>{" "}
                    <Badge outline>{statusLabel(objective.status)}</Badge>
                    {objective.description && (
                      <p className="mt-1 opacity-70">{objective.description}</p>
                    )}
                    {objective.notes && (
                      <p className="mt-1 whitespace-pre-wrap opacity-70">
                        {objective.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(
            [
              ["Pressures", plot.pressures],
              ["Resistance", plot.resistances],
            ] as const
          ).map(
            ([heading, cues]) =>
              cues.length > 0 && (
                <section key={heading}>
                  <h4 className="font-semibold">{heading}</h4>
                  <ul className="mt-2 grid gap-2">
                    {cues.map((cue, index) => (
                      <li key={index}>
                        <span className="font-medium">
                          {cue.name || "Unnamed cue"}
                        </span>
                        {cue.description && (
                          <p className="mt-1 opacity-70">{cue.description}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
          {plot.discoveries.length > 0 && (
            <section aria-label={`${plot.name || "Plot"} discoveries`}>
              <h4 className="font-semibold">Discoveries</h4>
              <ul className="mt-2 grid gap-3">
                {plot.discoveries.map((discovery, index) => (
                  <li key={index}>
                    <p className="font-medium">
                      {discovery.name || "Unnamed discovery"}
                    </p>
                    <ul className="mt-2 grid gap-2">
                      {discovery.claims.map((claim, claimIndex) => (
                        <li
                          key={claimIndex}
                          className="border-l-2 border-secondary/30 pl-3"
                        >
                          <p className="whitespace-pre-wrap">
                            {claim.statement}
                          </p>
                          <p className="mt-1 text-xs opacity-60">
                            {statusLabel(claim.kind)} ·{" "}
                            {claim.revealed
                              ? "Revealed"
                              : "Unrevealed · GM only"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {plot.children.length > 0 && (
            <section aria-label={`${plot.name || "Plot"} subplots`}>
              <h4 className="font-semibold">Subplots</h4>
              <ul className="mt-2 grid gap-3">
                {plot.children.map((child) => (
                  <PlotCue key={child.key} plot={child} showFocus={showFocus} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </details>
    </li>
  );
}

export function CampaignSessionTable({
  campaignDefinitionId,
  campaignInstanceId,
  sessionId,
}: {
  campaignDefinitionId: string;
  campaignInstanceId: string;
  sessionId: string;
}) {
  const [data, setData] = useState<CampaignSessionTableProjection>();
  const [locationId, setLocationId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const locationMatches = !locationId || data?.location?.id === locationId;
  const context = `${campaignDefinitionId}/${campaignInstanceId}/${sessionId}`;
  const previousContext = useRef(context);
  const load = useCallback(async () => {
    const requestSequence = ++sequence.current;
    try {
      const projection = await getCampaignSessionTable(
        campaignDefinitionId,
        campaignInstanceId,
        sessionId,
        locationId,
      );
      if (requestSequence !== sequence.current) return;
      setData((previous) => {
        // Captured terrain is immutable within an Instance snapshot. Keep its
        // reference stable so ordinary runtime polling does not rebuild geometry.
        if (
          projection.location?.terrain &&
          previous?.location?.terrain &&
          projection.captured.snapshotNumber ===
            previous.captured.snapshotNumber &&
          projection.location.id === previous.location.id
        ) {
          return {
            ...projection,
            location: {
              ...projection.location,
              terrain: previous.location.terrain,
            },
          };
        }
        return projection;
      });
      setError("");
    } catch (caught) {
      if (requestSequence !== sequence.current) return;
      if (
        caught instanceof ApiRequestError &&
        [401, 403, 404].includes(caught.status)
      ) {
        setData(undefined);
      }
      setError(
        "The table could not be refreshed. Retry to load the latest captured context.",
      );
    } finally {
      if (requestSequence === sequence.current) setLoading(false);
    }
  }, [campaignDefinitionId, campaignInstanceId, sessionId, locationId]);
  useEffect(() => {
    if (previousContext.current !== context) {
      previousContext.current = context;
      setLocationId(undefined);
      setData(undefined);
    }
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      sequence.current++;
      window.clearInterval(timer);
    };
  }, [context, load]);

  return (
    <section
      className="rounded-box border border-base-300 bg-base-200 p-5 text-base-content lg:col-span-2 lg:p-6"
      aria-labelledby="session-table-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="session-table-heading" className="text-2xl font-semibold">
            Table
          </h2>
          <p className="mt-1 text-sm opacity-60">
            Captured campaign context for the GM.
          </p>
        </div>
        <Button tone="outline" size="sm" onClick={() => void load()}>
          Refresh table
        </Button>
      </div>
      {error && (
        <p className="mt-4 text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {loading && !data && (
        <p className="mt-6 text-sm opacity-65" role="status">
          Opening the table…
        </p>
      )}
      {data && (
        <>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm opacity-70">
            <p>
              {data.captured.campaign.name || "Captured Campaign"} revision{" "}
              {data.captured.campaign.revisionNumber} ·{" "}
              {data.captured.world.name || "Captured World"} revision{" "}
              {data.captured.world.revisionNumber}
            </p>
            <p>
              {data.campaignTime
                ? `Campaign clock: ${dateLabel(data.campaignTime)}`
                : "Campaign clock not set"}
            </p>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <section
              className="min-w-0 rounded-box border border-base-300 bg-base-100 p-4"
              aria-label="Captured Location map"
            >
              <Label htmlFor="session-table-location" className="font-medium">
                Viewing Location
              </Label>
              <Select
                id="session-table-location"
                className="mt-2 w-full"
                value={locationId ?? data.location?.id ?? ""}
                disabled={!data.locations.length}
                onChange={(event) => {
                  setLoading(true);
                  setLocationId(event.currentTarget.value);
                }}
              >
                {!data.locations.length && (
                  <option value="">No captured Locations</option>
                )}
                {data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name || "Unnamed Location"}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs opacity-60">
                Viewing a Location does not move the party.
              </p>
              {locationMatches && data.focus === "starting-location" && (
                <p className="mt-1 text-xs opacity-60">
                  Initially showing the prepared starting Location.
                </p>
              )}
              {locationMatches && data.focus === "first-available" && (
                <p className="mt-1 text-xs opacity-60">
                  No starting Location is set; showing the first captured
                  Location.
                </p>
              )}
              {loading && (
                <p className="mt-3 text-sm opacity-60" role="status">
                  Updating viewed Location…
                </p>
              )}
              {!locationMatches ? (
                <p className="mt-6 text-sm opacity-65">
                  {loading
                    ? "Loading the selected Location…"
                    : "The selected Location is unavailable. Select another Location or refresh the table."}
                </p>
              ) : data.location ? (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold">
                    {data.location.name || "Unnamed Location"}
                  </h3>
                  {data.location.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm opacity-70">
                      {data.location.description}
                    </p>
                  )}
                  <div className="mt-4 overflow-hidden rounded-box border border-base-300">
                    {data.location.mapStatus === "isometric" &&
                    data.location.terrain ? (
                      <CampaignSessionTerrainOverview
                        volume={data.location.terrain}
                      />
                    ) : data.location.image ? (
                      <CapturedMapImage
                        key={data.location.image.assetId}
                        image={data.location.image}
                        name={data.location.name}
                      />
                    ) : (
                      <p className="grid min-h-64 place-items-center p-8 text-center text-sm opacity-65">
                        {data.location.mapUnavailableReason ||
                          "No map was captured for this Location."}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-6 text-sm opacity-65">
                  No captured Location is available for this table.
                </p>
              )}
            </section>
            <aside
              className="rounded-box border border-base-300 bg-base-100 p-4"
              aria-labelledby="session-party-heading"
            >
              <h3 id="session-party-heading" className="text-lg font-semibold">
                Characters and actors
              </h3>
              {data.party.length ? (
                <ul className="mt-4 grid gap-3">
                  {data.party.map((actor) => (
                    <li
                      key={actor.key}
                      className="rounded-box border border-base-300 p-3"
                    >
                      <p className="font-medium">
                        {actor.name || "Unnamed actor"}
                      </p>
                      <p className="mt-1 text-xs opacity-60">
                        {actor.kind === "character" ? "Character" : "Actor"}
                        {actor.playerName ? ` · ${actor.playerName}` : ""}
                      </p>
                      <p className="mt-2 text-sm">
                        {actor.locationName || "Location not set"}
                      </p>
                      {locationMatches && actor.atFocusedLocation && (
                        <p className="mt-1 text-xs text-secondary">
                          At viewed Location
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm opacity-65">
                  No Characters or actors have been prepared for this Instance.
                </p>
              )}
              <div className="mt-5 border-t border-base-300 pt-4">
                <h3 className="font-semibold">Encounter & adjudication</h3>
                <p className="mt-2 text-sm opacity-65">
                  {data.encounter.detail}
                </p>
              </div>
            </aside>
          </div>
          <section className="mt-6" aria-labelledby="session-plot-cues-heading">
            <h3
              id="session-plot-cues-heading"
              className="text-xl font-semibold"
            >
              Plot cues & discoveries
            </h3>
            <p className="mt-1 text-sm opacity-60">
              GM context, including unrevealed claims and current Instance
              progress.
            </p>
            {data.plots.length ? (
              <ul className="mt-4 grid gap-4">
                {data.plots.map((plot) => (
                  <PlotCue
                    key={plot.key}
                    plot={plot}
                    showFocus={locationMatches}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm opacity-65">
                No Plots were captured for this campaign.
              </p>
            )}
          </section>
          {data.unavailable.length > 0 && (
            <div className="mt-4 text-sm opacity-65" role="status">
              {data.unavailable.map((message, index) => (
                <p key={index}>{message}</p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
