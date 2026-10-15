import { SessionLocationPresentation } from "./SessionLocationPresentation";
import { Details, Summary } from "@aow/ui";
import { SessionWorkspace } from "./SessionWorkspace";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { useSessionMovement } from "./useSessionMovement";
import { SessionMovementPanel } from "./SessionMovementPanel";
import { SessionCombatPanel } from "./SessionCombatPanel";
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
    <img
      src={result.url}
      alt={image.altText?.trim() || `${name} map`}
      className="h-full min-h-64 w-full object-contain"
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
      <Details open>
        <Summary className="cursor-pointer font-semibold">
          {plot.name.trim() || "Unnamed Plot"}{" "}
          <Badge className="ml-2" outline>
            {statusLabel(plot.status)}
          </Badge>
          {showFocus && plot.atFocusedLocation && (
            <span className="ml-2 text-xs font-normal text-secondary">
              At viewed Location
            </span>
          )}
        </Summary>
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
      </Details>
    </li>
  );
}

export function CampaignSessionTable({
  campaignDefinitionId,
  campaignInstanceId,
  sessionId,
  sessionName = "Session",
  controls,
}: {
  campaignDefinitionId: string;
  campaignInstanceId: string;
  sessionId: string;
  sessionName?: string;
  controls?: ReactNode;
}) {
  const [data, setData] = useState<CampaignSessionTableProjection>();
  const [locationId, setLocationId] = useState<string>();
  const [zoom, setZoom] = useState(1);
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
  const movement = useSessionMovement({
    campaignDefinitionId,
    campaignInstanceId,
    sessionId,
    focusLocationId: locationMatches ? (data?.location?.id ?? null) : null,
    expectedRuntimeRevision: data?.runtimeRevision,
    expectedSnapshotNumber: data?.captured.snapshotNumber,
    blocked:
      loading ||
      Boolean(error) ||
      !locationMatches ||
      data?.status !== "active",
    onCommitted: () => void load(),
  });
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
    <SessionWorkspace
      title={sessionName}
      gm={
        <>
          {controls}
          <Button tone="outline" onClick={() => void load()}>
            Refresh table
          </Button>
          {error && (
            <p role="alert" className="text-error">
              {error}
            </p>
          )}
          {loading && <p role="status">Refreshing the table…</p>}
          {data && (
            <>
              {locationMatches && data.location && (
                <section>
                  <h2 className="text-xl font-semibold">
                    {data.location.name || "Unnamed Location"}
                  </h2>
                  {data.location.description && (
                    <p className="mt-2 text-sm opacity-70">
                      {data.location.description}
                    </p>
                  )}
                  <SessionLocationPresentation
                    key={data.location.id}
                    campaignId={campaignDefinitionId}
                    instanceId={campaignInstanceId}
                    sessionId={sessionId}
                    location={data.location}
                    runtimeRevision={data.runtimeRevision}
                    onSaved={() => void load()}
                  />
                </section>
              )}
              <Label
                htmlFor="session-table-location"
                className="block font-medium"
              >
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
                  setZoom(1);
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

              <Details>
                <Summary className="min-h-11 cursor-pointer font-semibold">
                  Move a creature
                </Summary>
                <SessionMovementPanel
                  campaignDefinitionId={campaignDefinitionId}
                  campaignInstanceId={campaignInstanceId}
                  sessionId={sessionId}
                  controller={movement}
                />
              </Details>
              <Details>
                <Summary className="min-h-11 cursor-pointer font-semibold">
                  Plot cues & discoveries
                </Summary>
                <section
                  className="mt-6"
                  aria-labelledby="session-plot-cues-heading"
                >
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
              </Details>
              <Details>
                <Summary className="min-h-11 cursor-pointer">
                  Campaign context
                </Summary>
                <p>
                  {data.captured.campaign.name || "Captured Campaign"} ·
                  Revision {data.captured.campaign.revisionNumber}
                </p>
                <p>
                  {data.captured.world.name || "Captured World"} · Revision{" "}
                  {data.captured.world.revisionNumber}
                </p>
                {data.campaignTime && <p>{dateLabel(data.campaignTime)}</p>}
                {data.unavailable.map((message, index) => (
                  <p key={index}>{message}</p>
                ))}
              </Details>
            </>
          )}
        </>
      }
      players={
        data ? (
          <>
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
              <SessionCombatPanel
                key={context}
                campaignDefinitionId={campaignDefinitionId}
                campaignInstanceId={campaignInstanceId}
                sessionId={sessionId}
                blocked={data.status !== "active"}
                onCommitted={() => void load()}
              />
            </div>
          </>
        ) : (
          <p>Opening the table…</p>
        )
      }
      utilities={
        <>
          <Button
            tone="outline"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
          >
            −
          </Button>
          <Button
            tone="outline"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
          >
            +
          </Button>
          <Button tone="outline" className="flex-1" onClick={() => setZoom(1)}>
            Fit map
          </Button>
        </>
      }
    >
      {data ? (
        <>
          {!locationMatches ? (
            <p className="mt-6 text-sm opacity-65">
              {loading
                ? "Loading the selected Location…"
                : "The selected Location is unavailable. Select another Location or refresh the table."}
            </p>
          ) : data.location ? (
            <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
              <div className="h-full overflow-hidden">
                {data.location.mapStatus === "isometric" &&
                data.location.terrain ? (
                  <CampaignSessionTerrainOverview
                    volume={data.location.terrain}
                    actors={movement.actors}
                    focusedActorId={movement.actor?.id}
                    onActorSelect={movement.setActorId}
                    onDestinationPick={movement.pickDestination}
                    pendingDestination={movement.pendingDestination}
                    interactionDisabled={movement.disabled}
                    coherent={movement.coherent && locationMatches}
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
        </>
      ) : (
        <p className="p-6" role="status">
          {error
            ? "Map unavailable. Open GM context to retry."
            : "Opening the map…"}
        </p>
      )}
    </SessionWorkspace>
  );
}
