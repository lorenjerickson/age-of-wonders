import test from "node:test";
import assert from "node:assert/strict";
import { CampaignInstance, createEncounterState } from "../dist/index.js";
const captured = {
  campaignInstanceId: "instance",
  campaignInstanceSnapshotId: "capture",
  capturedPlotObjectiveIds: new Map(),
  capturedLocationIds: new Set(["room"]),
  capturedCampaignPlacementIds: new Set(),
  capturedWorldPlacementIds: new Set(),
  capturedCreaturePolicies: new Map(),
};
test("Instance publication applies health and square-to-feet positions together while preserving private actor data", async () => {
  const actor = {
    identity: { id: "actor", version: { revision: 1, updatedAt: "before" } },
    entityId: "entity",
    name: "Hero",
    currentLocationId: "room",
    terrainPosition: { x: 10, y: 15, z: 0 },
    combat: {
      hp: 12,
      maxHp: 12,
      prone: false,
      removed: false,
      private: "retained",
    },
    extensions: { private: true },
  };
  const state = {
    formatVersion: 1,
    preparation: {},
    plotProgress: [],
    placementRealizations: [],
    creatureEmbodiments: [
      {
        campaignInstanceId: "instance",
        runtimeCreatureId: "actor",
        runtimeEntityId: "entity",
        source: { kind: "instance-created", reason: "setup" },
        creature: actor,
      },
    ],
    itemInstances: [],
  };
  const profile = {
    attackCost: { kind: "free" },
    reactions: [],
    attack: [],
    defense: [],
    damage: [],
    resistance: [],
    might: [],
    reachSquares: 1,
    movementCheckpoints: 6,
    resources: {},
    rules: [],
    pairings: [],
  };
  const encounter = createEncounterState({
    identity: {
      id: "encounter",
      version: { revision: 1, updatedAt: "before" },
    },
    name: "Fight",
    environment: { grid: "square", scale: { value: 5, unit: "foot" } },
    combatants: [
      {
        entityId: "entity",
        name: "Hero",
        controllerIds: [],
        playerControlled: false,
        visibleToPlayers: true,
        hp: 7,
        maxHp: 12,
        profile,
        position: { sceneId: "room", point: { x: 3, y: 3, z: 0 } },
      },
    ],
  });
  const owner = CampaignInstance.deserializePayload(state, { captured });
  await owner.command("encounter", {
    initiator: "gm",
    context: {},
    params: { encounter, updatedAt: "after" },
  });
  assert.equal(owner.state.data.creatureEmbodiments[0].creature.combat.hp, 12);
  await owner.command("encounter", {
    initiator: "gm",
    context: {},
    params: {
      encounter: { ...encounter, phase: "published" },
      publish: true,
      updatedAt: "after",
    },
  });
  const result = owner.state.data.creatureEmbodiments[0].creature;
  assert.deepEqual(result.terrainPosition, { x: 15, y: 15, z: 0 });
  assert.equal(result.combat.hp, 7);
  assert.equal(result.combat.private, "retained");
  assert.equal(result.extensions.private, true);
  assert.equal(result.identity.version.updatedAt, "after");
  owner.dispose();
});
