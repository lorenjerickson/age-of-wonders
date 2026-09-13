import {
  isTerrainActorPosition,
  type ParticipantSpatialBinding,
} from "@aow/common";
import { isRecord } from "../world-definitions/terrain-snapshot";
import { capturedActorPositionIssue } from "./actor-position";

/** Explicit allowlist projection: never spread runtime state or accept a client observer identity. */
export function participantActorBinding(
  instanceId: string,
  state: unknown,
  characterId: string,
  runtimeRevision: number,
  capturedWorld: unknown,
): ParticipantSpatialBinding {
  if (!isRecord(state) || !Array.isArray(state.creatureEmbodiments))
    return { status: "unavailable", reason: "actor-unplaced" };
  const matches = state.creatureEmbodiments.filter(
    (a) =>
      isRecord(a) &&
      a.campaignInstanceId === instanceId &&
      isRecord(a.source) &&
      a.source.kind === "character" &&
      a.source.characterId === characterId,
  );
  if (
    matches.length !== 1 ||
    !isRecord(matches[0]) ||
    !isRecord(matches[0].creature)
  )
    return { status: "unavailable", reason: "actor-unplaced" };
  const creature = matches[0].creature,
    point = creature.terrainPosition;
  if (
    !isTerrainActorPosition(point) ||
    capturedActorPositionIssue(capturedWorld, creature.currentLocationId, point)
  )
    return { status: "unavailable", reason: "actor-unplaced" };
  return {
    status: "awaiting-visibility",
    runtimeRevision,
    actor: {
      name:
        typeof creature.name === "string" && creature.name.trim()
          ? creature.name.trim()
          : "Your actor",
      position: { x: point.x, y: point.y, z: point.z },
    },
  };
}
