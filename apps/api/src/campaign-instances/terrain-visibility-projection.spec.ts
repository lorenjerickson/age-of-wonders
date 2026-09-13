import {
  applyTerrainWrites,
  createTerrainSightIndex,
  createTerrainVolume,
  terrainShapePreset,
} from "@aow/common";
import { projectAuthorizedTerrain } from "./terrain-visibility-projection";
const volume = applyTerrainWrites(
  createTerrainVolume({ x: 10, y: 10, z: 10 }, [
    {
      key: "terrain:stone",
      revision: 1,
      name: "Secret masonry label",
      terrainType: "terrain:stone",
    },
    {
      key: "terrain:wood",
      revision: 1,
      name: "Unseen material",
      terrainType: "terrain:wood",
    },
  ]),
  [
    {
      address: { x: 1, y: 1, z: 1 },
      cell: {
        materialKey: "terrain:stone",
        shape: terrainShapePreset("cube"),
        opening: {
          id: "secret-door-id",
          kind: "door",
          state: "locked",
          facing: 0,
          frameThickness: 0.125,
        },
      },
    },
    {
      address: { x: 1, y: 1, z: 4 },
      cell: { materialKey: "terrain:wood", shape: terrainShapePreset("cube") },
    },
  ],
).volume;
const context = {
  campaignInstanceId: "instance",
  snapshotId: "snapshot",
  runtimeRevision: 4,
  locationId: "map",
  observerId: "hero",
};
const actors = [
  {
    id: "hero",
    name: "Hero",
    position: { x: 0.5, y: 0.5, z: 1 },
    gmNotes: "Do not disclose",
  },
  { id: "hidden", name: "Hidden monster", position: { x: 5.5, y: 5.5, z: 1 } },
];
const surface = createTerrainSightIndex(volume).surfaces({
  x: 1,
  y: 1,
  z: 1,
})[0];
const decision = {
  context,
  visibleActorIds: ["hero"],
  visibleSurfaceKeys: [surface.key],
};
describe("authorized terrain surface projection gate", () => {
  it("does not invent visibility without rules or reuse results from another observer/revision/map", () => {
    expect(projectAuthorizedTerrain({ context, volume, actors })).toEqual({
      status: "awaiting-visibility",
    });
    for (const changed of [
      { runtimeRevision: 5 },
      { campaignInstanceId: "other" },
      { observerId: "hidden" },
      { snapshotId: "other" },
      { locationId: "other" },
    ])
      expect(
        projectAuthorizedTerrain({
          context,
          volume,
          actors,
          decision: { ...decision, context: { ...context, ...changed } },
        }),
      ).toEqual({ status: "awaiting-visibility" });
  });
  it("sends only approved triangles and actors, without hidden geometry, source state or labels", () => {
    const result = projectAuthorizedTerrain({
      context,
      volume,
      actors,
      decision,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error();
    expect(result.surfaces).toHaveLength(1);
    expect(result.surfaces[0].triangle).toEqual(surface.triangle);
    expect(result.materials).toEqual([{ key: "terrain:stone", revision: 1 }]);
    expect(result.actors).toEqual([
      { id: "hero", name: "Hero", position: { x: 0.5, y: 0.5, z: 1 } },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /secret|locked|opening|hidden|gmNotes|chunks|wood|terrainType|frameThickness/i,
    );
  });
  it("rejects malformed or foreign grants atomically and requires the selected actor", () => {
    for (const bad of [
      { visibleSurfaceKeys: [surface.key, "1,1,1/solid/999"] },
      { visibleActorIds: ["hero", "foreign"] },
      { visibleActorIds: [] },
      { visibleSurfaceKeys: ["../secret"] },
    ])
      expect(
        projectAuthorizedTerrain({
          context,
          volume,
          actors,
          decision: { ...decision, ...bad },
        }),
      ).toEqual({ status: "awaiting-visibility" });
  });
  it("rejects actors outside the captured map even within global coordinate limits", () => {
    expect(
      projectAuthorizedTerrain({
        context,
        volume,
        decision,
        actors: [{ ...actors[0], position: { x: 10, y: 1, z: 1 } }],
      }),
    ).toEqual({ status: "awaiting-visibility" });
  });
});
