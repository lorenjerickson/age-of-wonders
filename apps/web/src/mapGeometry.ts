export interface MapPoint {
  x: number;
  y: number;
}

export interface MapSegment {
  start: MapPoint;
  end: MapPoint;
}

export interface MapTransitionGeometry<T> {
  radius: number;
  position: MapPoint;
  destination: T;
}

const EDGE_SEGMENTS: readonly MapSegment[] = [
  { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  { start: { x: 1, y: 0 }, end: { x: 1, y: 1 } },
  { start: { x: 1, y: 1 }, end: { x: 0, y: 1 } },
  { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } },
];

function cross(a: MapPoint, b: MapPoint) {
  return a.x * b.y - a.y * b.x;
}

function rayIntersection(
  origin: MapPoint,
  direction: MapPoint,
  segment: MapSegment,
) {
  const span = {
    x: segment.end.x - segment.start.x,
    y: segment.end.y - segment.start.y,
  };
  const offset = {
    x: segment.start.x - origin.x,
    y: segment.start.y - origin.y,
  };
  const denominator = cross(direction, span);
  if (Math.abs(denominator) < 1e-10) return;
  const distance = cross(offset, span) / denominator;
  const along = cross(offset, direction) / denominator;
  if (distance < 0 || along < 0 || along > 1) return;
  return {
    distance,
    point: {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
    },
  };
}

/** Returns the normalized polygon visible from an observer through sight-blocking segments. */
export function visibilityPolygon(
  observer: MapPoint,
  blockers: readonly MapSegment[],
): MapPoint[] {
  const segments = [...EDGE_SEGMENTS, ...blockers];
  const epsilon = 0.00001;
  const angles = segments.flatMap(({ start, end }) =>
    [start, end].flatMap((point) => {
      const angle = Math.atan2(point.y - observer.y, point.x - observer.x);
      return [angle - epsilon, angle, angle + epsilon];
    }),
  );
  return angles
    .map((angle) => {
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const hit = segments.reduce<
        { distance: number; point: MapPoint } | undefined
      >((closest, segment) => {
        const candidate = rayIntersection(observer, direction, segment);
        return candidate && (!closest || candidate.distance < closest.distance)
          ? candidate
          : closest;
      }, undefined);
      return hit ? { angle, point: hit.point } : undefined;
    })
    .filter(
      (hit): hit is { angle: number; point: MapPoint } => hit !== undefined,
    )
    .sort((a, b) => a.angle - b.angle)
    .map(({ point }) => point);
}

/**
 * Drops a point straight down to the closest sufficiently horizontal segment.
 * The bottom of the background image is the final floor when no wall catches
 * the point. Non-side-on renderers should not call this function.
 */
export function alignToGravity(
  point: MapPoint,
  walls: readonly MapSegment[],
): MapPoint {
  let closestY: number | undefined;
  for (const { start, end } of walls) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) < 1e-10 || Math.abs(dy / dx) > 0.25) continue;
    const minimumX = Math.min(start.x, end.x);
    const maximumX = Math.max(start.x, end.x);
    if (point.x < minimumX || point.x > maximumX) continue;
    const y = start.y + ((point.x - start.x) / dx) * dy;
    if (y < point.y || (closestY !== undefined && y >= closestY)) continue;
    closestY = y;
  }
  return { x: point.x, y: closestY ?? 1 };
}

/** Returns the first transition whose trigger overlaps a token. */
export function intersectingTransition<T>(
  token: MapPoint,
  tokenRadius: number,
  transitions: readonly MapTransitionGeometry<T>[],
): MapTransitionGeometry<T> | undefined {
  return transitions.find((transition) => {
    const dx = transition.position.x - token.x;
    const dy = transition.position.y - token.y;
    const combinedRadius = transition.radius + tokenRadius;
    return dx * dx + dy * dy <= combinedRadius * combinedRadius;
  });
}
