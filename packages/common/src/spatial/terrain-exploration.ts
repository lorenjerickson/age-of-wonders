import type {
  TerrainObservationContext,
  TerrainExploredSurface,
  TerrainExplorationObservation,
  TerrainExplorationSnapshot,
} from "../types/terrain-exploration";

export const MAX_TERRAIN_EXPLORATION_SURFACES = 100_000;
const scopeKeys = [
  "campaignInstanceId",
  "snapshotId",
  "locationId",
  "observerId",
] as const;
const surfacePattern =
  /^(?:0|[1-9]\d?),(?:0|[1-9]\d?),(?:0|[1-9]\d?)\/(solid|frame|panel|glass)\/(?:0|[1-9]\d{0,2})$/;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 1;
function fail(): never {
  throw new TypeError("The exploration snapshot or observation is invalid.");
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail();
}
export function isTerrainSurfaceKey(value: unknown): value is string {
  return typeof value === "string" && surfacePattern.test(value);
}
export function sameTerrainObservationScope(
  a: TerrainObservationContext,
  b: TerrainObservationContext,
) {
  return scopeKeys.every((key) => a[key] === b[key]);
}
function context(value: unknown): TerrainObservationContext {
  if (!record(value)) return fail();
  exact(value, [...scopeKeys, "runtimeRevision"]);
  if (
    scopeKeys.some(
      (key) =>
        typeof value[key] !== "string" ||
        !(value[key] as string).trim() ||
        (value[key] as string).length > 200,
    ) ||
    !integer(value.runtimeRevision)
  )
    return fail();
  return {
    campaignInstanceId: value.campaignInstanceId as string,
    snapshotId: value.snapshotId as string,
    locationId: value.locationId as string,
    observerId: value.observerId as string,
    runtimeRevision: value.runtimeRevision,
  };
}
function keys(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_TERRAIN_EXPLORATION_SURFACES ||
    Array.from(value).some((key) => !isTerrainSurfaceKey(key)) ||
    new Set(value).size !== value.length
  )
    return fail();
  return [...value].sort();
}
function surface(
  value: unknown,
  remembered: boolean,
): TerrainExploredSurface & { lastSeenRuntimeRevision?: number } {
  if (!record(value)) return fail();
  exact(value, [
    "key",
    "material",
    "treatment",
    "triangle",
    ...(remembered ? ["lastSeenRuntimeRevision"] : []),
  ]);
  if (!isTerrainSurfaceKey(value.key) || !record(value.material)) return fail();
  exact(value.material, ["key", "revision"]);
  if (
    typeof value.material.key !== "string" ||
    value.material.key.length > 200 ||
    !/^[^\s:]+:[^\s:]+$/.test(value.material.key) ||
    !integer(value.material.revision) ||
    !["terrain", "glass"].includes(value.treatment as string)
  )
    return fail();
  if (!Array.isArray(value.triangle) || value.triangle.length !== 3)
    return fail();
  const triangle = Array.from(value.triangle, (point) => {
    if (!record(point)) return fail();
    exact(point, ["x", "y", "z"]);
    if (
      ["x", "y", "z"].some(
        (axis) =>
          typeof point[axis] !== "number" ||
          !Number.isFinite(point[axis]) ||
          (point[axis] as number) < 0 ||
          (point[axis] as number) > 100,
      )
    )
      return fail();
    return { x: point.x as number, y: point.y as number, z: point.z as number };
  }) as unknown as TerrainExploredSurface["triangle"];
  if (remembered && !integer(value.lastSeenRuntimeRevision)) return fail();
  return {
    key: value.key,
    material: {
      key: value.material.key as TerrainExploredSurface["material"]["key"],
      revision: value.material.revision,
    },
    treatment: value.treatment as TerrainExploredSurface["treatment"],
    triangle,
    ...(remembered
      ? { lastSeenRuntimeRevision: value.lastSeenRuntimeRevision as number }
      : {}),
  };
}

/** Strict read boundary for versioned JSON; unknown fields are rejected, never carried to players. */
export function parseTerrainExplorationSnapshot(
  value: unknown,
): TerrainExplorationSnapshot {
  if (!record(value)) return fail();
  exact(value, ["formatVersion", "context", "visibleSurfaceKeys", "surfaces"]);
  if (
    value.formatVersion !== 1 ||
    !Array.isArray(value.surfaces) ||
    value.surfaces.length > MAX_TERRAIN_EXPLORATION_SURFACES
  )
    return fail();
  const scope = context(value.context),
    visibleSurfaceKeys = keys(value.visibleSurfaceKeys);
  const surfaces = Array.from(value.surfaces, (s) =>
    surface(s, true),
  ) as TerrainExplorationSnapshot["surfaces"][number][];
  const byKey = new Map(surfaces.map((s) => [s.key, s]));
  if (
    byKey.size !== surfaces.length ||
    surfaces.some((s) => s.lastSeenRuntimeRevision > scope.runtimeRevision) ||
    visibleSurfaceKeys.some(
      (key) =>
        byKey.get(key)?.lastSeenRuntimeRevision !== scope.runtimeRevision,
    )
  )
    return fail();
  surfaces.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { formatVersion: 1, context: scope, visibleSurfaceKeys, surfaces };
}

/** Atomic pure update. No map reads, actor memory, automatic sharing, eviction, or implicit discovery. */
export function updateTerrainExploration(
  previous: unknown | undefined,
  observation: TerrainExplorationObservation,
): TerrainExplorationSnapshot {
  const scope = context(observation.context);
  if (
    !Array.isArray(observation.surfaces) ||
    observation.surfaces.length > MAX_TERRAIN_EXPLORATION_SURFACES
  )
    return fail();
  const visible = Array.from(observation.surfaces, (s) => surface(s, false));
  const visibleSurfaceKeys = keys(visible.map((s) => s.key)),
    absent = keys(observation.absentSurfaceKeys);
  const visibleSet = new Set(visibleSurfaceKeys);
  if (absent.some((key) => visibleSet.has(key))) return fail();
  const prior =
    previous === undefined
      ? undefined
      : parseTerrainExplorationSnapshot(previous);
  if (
    prior &&
    (!sameTerrainObservationScope(prior.context, scope) ||
      prior.context.runtimeRevision > scope.runtimeRevision)
  )
    throw new Error(
      "Exploration belongs to a different scope or a newer runtime revision.",
    );
  const memory = new Map(prior?.surfaces.map((s) => [s.key, s]));
  for (const key of absent) memory.delete(key);
  for (const s of visible)
    memory.set(s.key, { ...s, lastSeenRuntimeRevision: scope.runtimeRevision });
  if (memory.size > MAX_TERRAIN_EXPLORATION_SURFACES)
    throw new RangeError("Exploration exceeds the supported surface budget.");
  const next = parseTerrainExplorationSnapshot({
    formatVersion: 1,
    context: scope,
    visibleSurfaceKeys,
    surfaces: [...memory.values()],
  });
  if (
    prior?.context.runtimeRevision === scope.runtimeRevision &&
    JSON.stringify(prior) !== JSON.stringify(next)
  )
    throw new Error(
      "Conflicting exploration observations at the same runtime revision.",
    );
  return next;
}
