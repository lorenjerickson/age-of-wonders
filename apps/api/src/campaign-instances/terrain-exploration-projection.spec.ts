import {
  applyTerrainWrites,
  createTerrainVolume,
  terrainShapePreset,
} from "@aow/common";
import { projectTerrainWithExploration } from "./terrain-exploration-projection";
const base = createTerrainVolume({ x: 10, y: 10, z: 10 }, [
  {
    key: "terrain:stone",
    revision: 1,
    name: "Secret wall",
    terrainType: "terrain:stone",
  },
]);
const closed = applyTerrainWrites(base, [
  {
    address: { x: 2, y: 2, z: 1 },
    cell: {
      materialKey: "terrain:stone",
      shape: terrainShapePreset("cube"),
      opening: {
        id: "secret-lock",
        kind: "door",
        facing: 0,
        state: "closed",
        frameThickness: 0.125,
      },
    },
  },
]).volume;
const opened = applyTerrainWrites(closed, [
  {
    address: { x: 2, y: 2, z: 1 },
    cell: {
      ...closed.chunks[0].cells[0],
      opening: { ...closed.chunks[0].cells[0].opening!, state: "open" },
    },
  },
]).volume;
const context = {
  campaignInstanceId: "instance",
  snapshotId: "snapshot",
  locationId: "map",
  observerId: "hero",
  runtimeRevision: 1,
};
const actors = [
  { id: "hero", name: "Hero", position: { x: 1.5, y: 1.5, z: 1 } },
  { id: "other", name: "Creature", position: { x: 4.5, y: 4.5, z: 1 } },
];
const panel = "2,2,1/panel/0";
function project(
  revision: number,
  volume = closed,
  visibleSurfaceKeys: string[] = [panel],
  visibleActorIds = ["hero"],
  previousExploration?: unknown,
  observedAbsentSurfaceKeys: string[] = [],
) {
  const scope = { ...context, runtimeRevision: revision };
  return projectTerrainWithExploration({
    context: scope,
    volume,
    actors,
    previousExploration,
    decision: {
      context: scope,
      visibleSurfaceKeys,
      visibleActorIds,
      observedAbsentSurfaceKeys,
    },
  });
}
describe("safe current and remembered terrain composition", () => {
  it("remembers an unseen closed door after it opens, without remembering creatures", () => {
    const first = project(1, closed, [panel], ["hero", "other"]);
    if (first.status !== "ready")
      throw new Error("Expected initial projection");
    const next = project(
      2,
      opened,
      [],
      ["hero"],
      JSON.parse(JSON.stringify(first.exploration)),
    );
    if (next.status !== "ready")
      throw new Error("Expected remembered projection");
    expect(next.projection.visibleSurfaces).toEqual([]);
    expect(next.projection.rememberedSurfaces).toEqual(
      first.projection.visibleSurfaces,
    );
    expect(next.projection.actors.map((a) => a.id)).toEqual(["hero"]);
    expect(JSON.stringify(next.projection)).not.toMatch(
      /secret|Creature|opening|lastSeen|observedAbsent/,
    );
    const observed = project(3, opened, [], ["hero"], next.exploration, [
      panel,
    ]);
    if (observed.status !== "ready")
      throw new Error("Expected observed disappearance");
    expect(observed.projection.rememberedSurfaces).toEqual([]);
  });
  it("does not authorize absence of an existing surface or expose memory without a current decision", () => {
    const first = project(1);
    if (first.status !== "ready") throw new Error();
    expect(
      project(2, closed, [], ["hero"], first.exploration, [panel]),
    ).toEqual({ status: "awaiting-visibility" });
    expect(
      projectTerrainWithExploration({
        context,
        volume: closed,
        actors,
        previousExploration: first.exploration,
      }),
    ).toEqual({ status: "awaiting-visibility" });
  });
  it("rejects corrupt, cross-observer, future, and conflicting memory without partial output", () => {
    const first = project(1);
    if (first.status !== "ready") throw new Error();
    for (const memory of [
      { ...first.exploration, context: { ...context, observerId: "other" } },
      {
        ...first.exploration,
        context: { ...context, campaignInstanceId: "other" },
      },
      { ...first.exploration, context: { ...context, runtimeRevision: 9 } },
      { ...first.exploration, gmNotes: "secret" },
    ])
      expect(project(2, closed, [], ["hero"], memory)).toEqual({
        status: "awaiting-visibility",
      });
    expect(project(1, closed, [], ["hero"], first.exploration)).toEqual({
      status: "awaiting-visibility",
    });
  });
  it("retains old material revisions independently of currently visible surfaces", () => {
    const first = project(1);
    if (first.status !== "ready") throw new Error();
    const updated = {
      ...closed,
      materials: closed.materials.map((m) => ({ ...m, revision: 2 })),
    };
    const next = project(
      2,
      updated,
      ["2,2,1/frame/0"],
      ["hero"],
      first.exploration,
    );
    if (next.status !== "ready") throw new Error();
    expect(next.projection.visibleSurfaces[0].material.revision).toBe(2);
    expect(next.projection.rememberedSurfaces[0].material.revision).toBe(1);
  });
});
