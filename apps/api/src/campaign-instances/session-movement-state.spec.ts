import {
  applyTerrainWrites,
  createTerrainVolume,
  executeWorldRules,
  starterMovementRules,
} from "@aow/common";
import { movementGeometry, movementStateView } from "./session-movement-state";

describe("movement geometry and scoped state adapter", () => {
  it("counts a narrowly crossed sloped support cell using exact intervals", () => {
    const volume = applyTerrainWrites(
      createTerrainVolume({ x: 3, y: 3, z: 3 }, [
        {
          key: "terrain:stone",
          revision: 1,
          name: "Stone",
          terrainType: "terrain:stone",
        },
      ]),
      [
        {
          address: { x: 1, y: 1, z: 0 },
          cell: {
            materialKey: "terrain:stone",
            shape: { top: [1, 0, 0, 1], diagonal: "00-11" },
          },
        },
      ],
    ).volume;
    const facts = movementGeometry(
      volume,
      { x: 0.01, y: 1.5245, z: 1.99 },
      { x: 1.9, y: 0.5245, z: 0.1 },
    );
    expect(facts.slopedSegments).toBe(1);
    expect(facts.materials).toEqual(["terrain:stone"]);
  });
  it("keeps unplaced actors readable without invalid null point fields", () => {
    const state = movementStateView(
      {
        creatureEmbodiments: [
          {
            runtimeCreatureId: "hero",
            creature: {
              name: "Hero",
              terrainPosition: { x: 0.5, y: 0.5, z: 1 },
              currentLocationId: "place",
            },
          },
          { runtimeCreatureId: "unplaced", creature: { name: "Unplaced" } },
        ],
      },
      {},
      {},
    );
    expect(state.runtime.unplaced.fields).not.toHaveProperty("position");
    expect(state.runtime["aow:instance"].fields).not.toHaveProperty(
      "creatureEmbodiments",
    );
    expect(state.runtime.hero.fields).not.toHaveProperty("terrainPosition");
    const result = executeWorldRules({
      state,
      rules: starterMovementRules({
        budgetFeet: 30,
        ids: ["a", "b", "c", "d", "e", "f"],
        createdBy: "GM",
        updatedAt: new Date().toISOString(),
      }),
      event: {
        formatVersion: 1,
        id: "root",
        rootEventId: "root",
        idempotencyKey: "request-key",
        type: "aow:movement-declared",
        version: 1,
        source: "gm",
        context: {
          actorId: "hero",
          destination: { x: 1.5, y: 0.5, z: 1 },
          distanceFeet: 5,
          slopedSegments: 0,
          contactCount: 0,
          originInteriorCount: 0,
          destinationSupported: true,
          materials: [],
        },
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.status).toBe("applied");
  });
});
