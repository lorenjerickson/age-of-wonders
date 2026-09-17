import type { SessionMovementContext, TerrainPoint } from "@aow/common";

/** Preserve focus while valid; pick once from current-map actors when opening or replacing focus. */
export function chooseSessionMapActor(
  actors: readonly { id: string }[],
  currentId?: string,
  random: () => number = Math.random,
): string | undefined {
  if (currentId && actors.some((actor) => actor.id === currentId))
    return currentId;
  if (!actors.length) return undefined;
  const sample = Math.max(0, Math.min(1 - Number.EPSILON, random()));
  return actors[Math.floor(sample * actors.length)]!.id;
}
export function movementMapIsCoherent(
  context:
    | Pick<SessionMovementContext, "runtimeRevision" | "snapshotNumber">
    | undefined,
  runtimeRevision?: number,
  snapshotNumber?: number,
) {
  return Boolean(
    context &&
    runtimeRevision !== undefined &&
    snapshotNumber !== undefined &&
    context.runtimeRevision === runtimeRevision &&
    context.snapshotNumber === snapshotNumber,
  );
}

const coordinateDisplay = new Intl.NumberFormat("en", {
  maximumFractionDigits: 3,
  useGrouping: false,
});
/** Presentation only: declarations and stored actor positions retain exact coordinates. */
export function sessionPositionLabel(point: TerrainPoint) {
  return (
    "X " +
    coordinateDisplay.format(point.x) +
    ", Y " +
    coordinateDisplay.format(point.y) +
    ", Z " +
    coordinateDisplay.format(point.z)
  );
}
