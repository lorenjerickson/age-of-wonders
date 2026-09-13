import {
  createTerrainSightIndex,
  isTerrainActorPosition,
  isTerrainSurfaceKey,
  type TerrainObservationContext,
  type IsometricTerrainVolume,
  type TerrainPoint,
  type TerrainSurface,
} from "@aow/common";

/** Every visibility-affecting runtime mutation must advance runtimeRevision. */
export type SpatialProjectionContext = TerrainObservationContext;
export interface EvaluatedVisibilityDecision {
  readonly context: SpatialProjectionContext;
  readonly visibleSurfaceKeys: readonly string[];
  readonly visibleActorIds: readonly string[];
  /** Authorized observation of disappearance; never inferred from missing visible grants. */
  readonly observedAbsentSurfaceKeys?: readonly string[];
}
export interface ProjectionActor {
  readonly id: string;
  readonly name: string;
  readonly position: TerrainPoint;
}

/** Internal output gate, NOT an authorization endpoint. Only the future server rules evaluator may supply decisions. */
export function projectAuthorizedTerrain(input: {
  context: SpatialProjectionContext;
  volume: IsometricTerrainVolume;
  actors: readonly ProjectionActor[];
  decision?: EvaluatedVisibilityDecision;
}) {
  const waiting = { status: "awaiting-visibility" as const };
  const { decision, context } = input;
  if (
    !decision ||
    !decision.context ||
    ![
      "campaignInstanceId",
      "snapshotId",
      "runtimeRevision",
      "locationId",
      "observerId",
    ].every(
      (key) =>
        decision.context[key as keyof SpatialProjectionContext] ===
        context[key as keyof SpatialProjectionContext],
    )
  )
    return waiting;
  if (
    !Array.isArray(decision.visibleSurfaceKeys) ||
    decision.visibleSurfaceKeys.length > 100_000 ||
    !Array.isArray(decision.visibleActorIds) ||
    decision.visibleActorIds.length > 1000
  )
    return waiting;
  const absent = decision.observedAbsentSurfaceKeys ?? [];
  if (
    !Array.isArray(absent) ||
    absent.length > 100_000 ||
    absent.some((key) => !isTerrainSurfaceKey(key))
  )
    return waiting;
  const actors = new Map(input.actors.map((actor) => [actor.id, actor]));
  if (
    actors.size !== input.actors.length ||
    !actors.has(context.observerId) ||
    !decision.visibleActorIds.includes(context.observerId)
  )
    return waiting;
  const selectedActors: ProjectionActor[] = [];
  for (const id of new Set(decision.visibleActorIds)) {
    const actor = actors.get(id);
    if (
      !actor ||
      !isTerrainActorPosition(actor.position) ||
      actor.position.x >= input.volume.dimensions.x ||
      actor.position.y >= input.volume.dimensions.y ||
      actor.position.z > input.volume.dimensions.z
    )
      return waiting;
    selectedActors.push({
      id: actor.id,
      name: actor.name,
      position: {
        x: actor.position.x,
        y: actor.position.y,
        z: actor.position.z,
      },
    });
  }
  const geometry = createTerrainSightIndex(input.volume),
    selected: TerrainSurface[] = [];
  for (const key of new Set(decision.visibleSurfaceKeys)) {
    if (!isTerrainSurfaceKey(key)) return waiting;
    const [x, y, z] = key.split("/")[0].split(",").map(Number);
    const surface = geometry.surfaces({ x, y, z }).find((s) => s.key === key);
    if (!surface) return waiting;
    selected.push(surface);
  }
  for (const key of absent) {
    const [x, y, z] = key.split("/")[0].split(",").map(Number);
    if (geometry.surfaces({ x, y, z }).some((surface) => surface.key === key))
      return waiting;
  }
  const keys = new Set(selected.map((surface) => surface.materialKey));
  return {
    status: "ready" as const,
    context: {
      campaignInstanceId: context.campaignInstanceId,
      snapshotId: context.snapshotId,
      runtimeRevision: context.runtimeRevision,
      locationId: context.locationId,
      observerId: context.observerId,
    },
    actors: selectedActors,
    observedAbsentSurfaceKeys: [...new Set(absent)],
    surfaces: selected.map((surface) => ({
      key: surface.key,
      materialKey: surface.materialKey,
      treatment:
        surface.part === "glass" ? ("glass" as const) : ("terrain" as const),
      triangle: surface.triangle,
    })),
    materials: input.volume.materials
      .filter((m) => keys.has(m.key))
      .map((m) => ({ key: m.key, revision: m.revision })),
  };
}
