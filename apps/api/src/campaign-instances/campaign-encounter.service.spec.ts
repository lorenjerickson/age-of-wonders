import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import {
  CampaignEncounterService,
  encounterEntropy,
} from "./campaign-encounter.service";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import {
  bindCombatProfile,
  encounterSources,
} from "./campaign-encounter-sources";
const profile = {
  attackCost: { kind: "free" as const },
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
function fixture() {
  const manifest = buildSnapshotManifest(1, [
    { resourceType: "locations", sourceId: "room", payload: { name: "Hall" } },
  ]);
  const actor = {
    campaignInstanceId: "instance",
    runtimeCreatureId: "actor",
    runtimeEntityId: "entity",
    source: { kind: "instance-created", reason: "GM setup" },
    creature: {
      identity: { id: "actor", version: { revision: 1, updatedAt: "now" } },
      entityId: "entity",
      name: "Hero",
      currentLocationId: "room",
      terrainPosition: { x: 10, y: 15, z: 0 },
      extensions: { private: true },
    },
  };
  const instance = {
    id: "instance",
    currentSnapshotId: "snapshot",
    runtime: {
      id: "runtime",
      revision: 1,
      state: {
        formatVersion: 1,
        preparation: {},
        plotProgress: [],
        placementRealizations: [],
        creatureEmbodiments: [actor],
        itemInstances: [],
      } as Record<string, unknown>,
    },
    currentSnapshot: {
      worldDefinitionSnapshot: { manifest },
      campaignDefinitionSnapshot: { manifest },
    },
  };
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    campaignInstanceSession: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ status: "ACTIVE", campaignInstance: instance }),
    },
    campaignInstanceHumanMembership: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    campaignInstanceRuntime: {
      updateMany: jest
        .fn<
          Promise<{ count: number }>,
          [
            {
              where: Record<string, unknown>;
              data: { state: Record<string, unknown> };
            },
          ]
        >()
        .mockImplementation(({ data }) => {
          instance.runtime.state = data.state;
          instance.runtime.revision++;
          return Promise.resolve({ count: 1 });
        }),
    },
    campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new CampaignEncounterService({
    $transaction: (fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx)),
  } as never);
  const scope = {
    definitionId: "campaign",
    instanceId: "instance",
    sessionId: "session",
    userId: "gm",
  };
  const setup = () =>
    service.execute(scope, {
      expectedRuntimeRevision: 1,
      idempotencyKey: "setup",
      setup: {
        name: "Ambush",
        combatants: [{ entityId: "entity", hp: 12, maxHp: 12, profile }],
      },
    });
  return { service, scope, tx, instance, setup, actor };
}
describe("canonical Instance encounter adapter", () => {
  it("reproduces private entropy independently by actor and cursor", () => {
    const seed = "a".repeat(64);
    expect(encounterEntropy(seed, 3, "a")).toEqual(
      encounterEntropy(seed, 3, "a"),
    );
    expect(encounterEntropy(seed, 3, "a")[0]).not.toBe(
      encounterEntropy(seed, 3, "b")[0],
    );
    expect(encounterEntropy(seed, 3, "a")[0]).not.toBe(
      encounterEntropy(seed, 4, "a")[0],
    );
  });
  it("captures explicit setup without publishing actor health and preserves square/feet units", async () => {
    const { setup, instance, actor, tx } = fixture();
    const result = await setup();
    expect(result.encounter).toMatchObject({
      phase: "planning",
      combatants: [{ hp: 12, position: { point: { x: 2, y: 3, z: 0 } } }],
    });
    expect(
      (instance.runtime.state.creatureEmbodiments as unknown[])[0],
    ).toEqual(actor);
    expect(
      tx.campaignInstanceRuntime.updateMany.mock.calls[0][0].where,
    ).toMatchObject({ revision: 1, campaignInstanceSnapshotId: "snapshot" });
    expect(tx.campaignInstanceAuditEvent.create).toHaveBeenCalledTimes(1);
  });
  it("replays identical setup once and rejects a reused request key", async () => {
    const { setup, service, scope, tx } = fixture();
    await setup();
    await setup();
    expect(tx.campaignInstanceRuntime.updateMany).toHaveBeenCalledTimes(1);
    await expect(
      service.execute(scope, {
        expectedRuntimeRevision: 1,
        idempotencyKey: "setup",
        setup: { name: "Other", combatants: [] },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("rejects stale writes, player GM commands, foreign sources and unaligned positions", async () => {
    const { service, scope, actor, setup, tx } = fixture();
    await expect(
      service.execute(
        { ...scope, player: true },
        {
          expectedRuntimeRevision: 1,
          idempotencyKey: "x",
          setup: { name: "No", combatants: [] },
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.execute(scope, {
        expectedRuntimeRevision: 3,
        idempotencyKey: "x",
        setup: { name: "No", combatants: [] },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    actor.creature.terrainPosition.x = 11;
    await expect(setup()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.campaignInstanceRuntime.updateMany).not.toHaveBeenCalled();
    expect(() =>
      bindCombatProfile(
        {
          ...profile,
          attack: [
            {
              source: { kind: "weapon", id: "foreign", name: "Made up" },
              label: "Attack",
              terms: [],
            },
          ],
        },
        [{ kind: "base", id: "base", name: "Base roll" }],
      ),
    ).toThrow(BadRequestException);
  });
  it("keeps locked state durable and rejects publication across actor changes", async () => {
    const { setup, service, scope, instance } = fixture();
    await setup();
    await service.execute(scope, {
      expectedRuntimeRevision: 2,
      idempotencyKey: "lock",
      command: { kind: "lock", commandId: "lock", expectedRevision: 0 },
    });
    expect(instance.runtime.state.encounter).toMatchObject({ phase: "locked" });
    await service.execute(scope, {
      expectedRuntimeRevision: 3,
      idempotencyKey: "step",
      command: { kind: "step", commandId: "step", expectedRevision: 1 },
    });
    (
      instance.runtime.state.creatureEmbodiments as {
        creature: { name: string };
      }[]
    )[0].creature.name = "Changed";
    await expect(
      service.execute(scope, {
        expectedRuntimeRevision: 4,
        idempotencyKey: "publish",
        command: { kind: "publish", commandId: "publish", expectedRevision: 2 },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("rejects malformed operations and omits other players' plans, profiles and entropy", async () => {
    const { service, scope, tx } = fixture();
    await expect(service.execute(scope, null as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.execute(scope, {
        expectedRuntimeRevision: 1,
        idempotencyKey: "bad",
        setup: { name: 42, combatants: [] },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    tx.campaignInstanceHumanMembership.findMany.mockResolvedValue([
      { userId: "owner", displayName: "Owner" },
      { userId: "viewer", displayName: "Viewer" },
    ] as never);
    await service.execute(scope, {
      expectedRuntimeRevision: 1,
      idempotencyKey: "setup",
      setup: {
        name: "Encounter",
        combatants: [
          {
            entityId: "entity",
            hp: 12,
            maxHp: 12,
            profile,
            controllerIds: ["owner"],
          },
        ],
      },
    });
    const view = await service.read({
      ...scope,
      player: true,
      userId: "viewer",
    });
    expect(view.encounter).toMatchObject({ combatants: [{ name: "Hero" }] });
    const serialized = JSON.stringify(view);
    for (const field of [
      "seed",
      "receipts",
      "profile",
      "plans",
      "controllerIds",
      "setupActors",
    ])
      expect(serialized).not.toContain('"' + field + '"');
  });
  it("discards an accepted plan through the domain owner when its controller loses membership", async () => {
    const { service, scope, tx, instance } = fixture();
    tx.campaignInstanceHumanMembership.findMany.mockResolvedValue([
      { userId: "owner", displayName: "Owner" },
    ] as never);
    await service.execute(scope, {
      expectedRuntimeRevision: 1,
      idempotencyKey: "setup",
      setup: {
        name: "Encounter",
        combatants: [
          {
            entityId: "entity",
            hp: 12,
            maxHp: 12,
            profile,
            controllerIds: ["owner"],
          },
        ],
      },
    });
    await service.execute(scope, {
      expectedRuntimeRevision: 2,
      idempotencyKey: "edit",
      command: {
        kind: "edit-plan",
        commandId: "edit",
        expectedRevision: 0,
        combatantId: "entity" as never,
        planRevision: 0,
        activities: [
          {
            id: "move",
            name: "Move",
            kind: "move",
            path: [{ x: 3, y: 3, z: 0 }],
          },
        ],
      },
    });
    await service.execute(scope, {
      expectedRuntimeRevision: 3,
      idempotencyKey: "submit",
      command: {
        kind: "submit-plan",
        commandId: "submit",
        expectedRevision: 1,
        combatantId: "entity" as never,
        planRevision: 1,
      },
    });
    tx.campaignInstanceHumanMembership.findMany.mockResolvedValue([]);
    await service.execute(scope, {
      expectedRuntimeRevision: 4,
      idempotencyKey: "lock",
      command: { kind: "lock", commandId: "lock", expectedRevision: 2 },
    });
    expect(instance.runtime.state.encounter).toMatchObject({
      phase: "locked",
      plans: { entity: { discarded: true } },
      combatants: [{ controllerIds: [] }],
    });
  });
  it("offers only equipped Items and the explicit base source", () => {
    const sources = encounterSources(
      { creature: { equipment: { slots: { hand: "equipped" } } } },
      {
        itemInstances: [
          { id: "equipped", definitionId: "sword" },
          { id: "bagged", definitionId: "other" },
        ],
      },
      buildSnapshotManifest(1, [
        {
          resourceType: "definitions",
          sourceId: "sword",
          payload: { name: "Sword" },
        },
      ]),
    );
    expect(sources.some((s) => s.id === "equipped")).toBe(true);
    expect(sources.some((s) => s.id === "bagged")).toBe(false);
  });
});
