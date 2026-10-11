import type { IsometricTerrainVolume, TerrainPoint } from "@aow/common";
import { sessionPositionLabel } from "./sessionMovementMapModel";
import { IsometricTerrainViewport } from "./IsometricTerrainViewport";

const noSelection = [] as const;
const noStroke = () => {};

/** Full captured GM map. Marker interactions only declare destinations for rule review. */
export function CampaignSessionTerrainOverview({
  volume,
  actors,
  focusedActorId,
  onActorSelect,
  onDestinationPick,
  pendingDestination,
  interactionDisabled = false,
  coherent = true,
}: {
  volume: IsometricTerrainVolume;
  actors: readonly { id: string; name: string; position: TerrainPoint }[];
  focusedActorId?: string;
  onActorSelect(id: string): void;
  onDestinationPick(point: TerrainPoint): void;
  pendingDestination?: TerrainPoint;
  interactionDisabled?: boolean;
  coherent?: boolean;
}) {
  const focus = actors.find((actor) => actor.id === focusedActorId);
  if (!coherent)
    return (
      <p
        className="grid min-h-64 place-items-center p-8 text-center text-sm"
        role="status"
      >
        Refreshing the map and actor positions…
      </p>
    );
  if (!focus)
    return (
      <p
        className="grid min-h-64 place-items-center p-8 text-center text-sm"
        role="status"
      >
        Place an actor in this Location to open the interactive GM map.
      </p>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="border-b border-base-300 px-4 py-3 text-sm">
        GM overview · full captured map. Focus: {focus.name}.{" "}
        {interactionDisabled
          ? "Destinations are temporarily disabled. You can still focus actors and orbit the map."
          : "Click an actor to focus it, then click a surface to choose a destination for review."}
      </p>
      <IsometricTerrainViewport
        className="flex min-h-0 flex-1 flex-col"
        viewportClassName="min-h-0 flex-1"
        overview
        volume={volume}
        level={0}
        slice={false}
        actor={focus.position}
        selection={noSelection}
        disabled
        onStroke={noStroke}
        session={{
          actors,
          focusedActorId: focus.id,
          onActorSelect,
          onDestinationPick,
          pendingDestination,
          interactionDisabled,
        }}
      />
      {pendingDestination && (
        <p className="border-t border-base-300 px-4 py-3 text-sm" role="status">
          Proposed destination: {sessionPositionLabel(pendingDestination)}. The
          marked segment is a declaration, not an approved route. Preview the
          rules before approving movement.
        </p>
      )}
    </div>
  );
}
