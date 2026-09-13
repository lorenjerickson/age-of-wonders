import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { terrainShapePreset } from "@aow/common";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
} from "../domain/snapshot-manifest";
import { capturedActorPositionIssue } from "./actor-position";
import { participantActorBinding } from "./participant-spatial-binding";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import { CampaignSessionService } from "./campaign-session.service";
const chunk = {
  address: { x: 0, y: 0, z: 0 },
  cells: [
    {
      offset: 0,
      materialKey: "terrain:stone",
      shape: terrainShapePreset("cube"),
    },
    {
      offset: 256 * 3,
      materialKey: "terrain:stone",
      shape: terrainShapePreset("ramp"),
    },
  ],
};
const map = {
  kind: "isometric",
  formatVersion: 1,
  dimensions: { x: 10, y: 10, z: 10 },
  cellSize: { value: 5, unit: "ft" },
  chunkSize: 16,
  materials: [
    {
      key: "terrain:stone",
      revision: 1,
      name: "Stone",
      terrainType: "terrain:stone",
    },
  ],
  chunks: [{ address: chunk.address, contentHash: canonicalJsonHash(chunk) }],
};
const world = buildSnapshotManifest(1, [
  {
    resourceType: "locations",
    sourceId: "location",
    sourceRevision: 1,
    payload: { name: "Cavern", map },
  },
  {
    resourceType: "location-terrain-chunks",
    sourceId: canonicalJsonHash(chunk),
    sourceRevision: 1,
    payload: chunk,
  },
]);
const actor = {
  campaignInstanceId: "instance",
  runtimeCreatureId: "actor",
  runtimeEntityId: "entity",
  source: { kind: "character", characterId: "character" },
  creature: {
    identity: {
      id: "actor",
      version: { revision: 1, updatedAt: "2026-09-11T00:00:00.000Z" },
    },
    entityId: "entity",
    name: "Hero",
    currentLocationId: "location",
    terrainPosition: { x: 0.5, y: 0.5, z: 1 },
    extensions: { "gm:secret": "Do not send" },
  },
};
const state = {
  formatVersion: 1,
  preparation: {},
  plotProgress: [],
  placementRealizations: [],
  creatureEmbodiments: [
    actor,
    {
      ...actor,
      runtimeCreatureId: "enemy",
      source: { kind: "instance-created", reason: "Hidden monster" },
      creature: { ...actor.creature, name: "Secret monster" },
    },
  ],
  itemInstances: [],
};

describe("captured spatial actor setup", () => {
  it("supports different levels and slopes, and rejects air, bounds, extra fields, and wrong maps", () => {
    for (const z of [1, 3.5])
      expect(
        capturedActorPositionIssue(world, "location", { x: 0.5, y: 0.5, z }),
      ).toBeUndefined();
    for (const point of [
      { x: 0.5, y: 0.5, z: 2 },
      { x: 10, y: 0.5, z: 1 },
      { x: 0.5, y: 0.5, z: NaN },
      { x: 0.5, y: 0.5, z: 1, secret: true },
    ])
      expect(
        capturedActorPositionIssue(world, "location", point),
      ).toBeDefined();
    expect(
      capturedActorPositionIssue(world, "other", { x: 0.5, y: 0.5, z: 1 }),
    ).toBeDefined();
  });
  it("returns only the uniquely bound player's actor, never secret runtime or terrain", () => {
    const result = participantActorBinding(
      "instance",
      state,
      "character",
      4,
      world,
    );
    expect(result).toEqual({
      status: "awaiting-visibility",
      runtimeRevision: 4,
      actor: { name: "Hero", position: { x: 0.5, y: 0.5, z: 1 } },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret|monster|chunks|material/i,
    );
    expect(
      participantActorBinding("instance", state, "other-player", 4, world),
    ).toEqual({
      status: "unavailable",
      reason: "actor-unplaced",
    });
    expect(
      participantActorBinding(
        "instance",
        { ...state, creatureEmbodiments: [actor, actor] },
        "character",
        4,
        world,
      ).status,
    ).toBe("unavailable");
  });
  it("uses owner scope and stale-revision checks before accepting a setup write", async () => {
    const owned = {
      id: "instance",
      name: "Game",
      status: "PREPARING",
      currentSnapshot: { worldDefinitionSnapshot: { manifest: world } },
      runtime: { revision: 4, state },
    };
    const prisma = {
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(owned) },
    };
    const service = new CampaignInstanceManagementService(prisma as never);
    const write = jest
      .spyOn(service as never, "writeRuntime" as never)
      .mockResolvedValue(undefined as never);
    await service.placeActor("instance", "gm", "actor", {
      expectedRuntimeRevision: 4,
      locationId: "location",
      position: { x: 0.5, y: 0.5, z: 3.5 },
    });
    const call = write.mock.calls[0] as unknown[];
    expect(
      (call[3] as typeof state).creatureEmbodiments[0].creature.terrainPosition
        .z,
    ).toBe(3.5);
    expect(prisma.campaignInstance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "instance", ownerUserId: "gm" } }),
    );
    await expect(
      service.placeActor("instance", "gm", "actor", {
        expectedRuntimeRevision: 3,
        locationId: "location",
        position: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.placeActor("instance", "gm", "foreign", {
        expectedRuntimeRevision: 4,
        locationId: "location",
        position: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.placeActor("instance", "gm", "actor", {
        expectedRuntimeRevision: 4,
        locationId: "location",
        position: { x: 0.5, y: 0.5, z: 2 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("requires accepted active Session membership and resolves the current active Character server-side", async () => {
    const prisma = {
      sessionParticipation: {
        findFirst: jest.fn().mockResolvedValue({
          role: "PLAYER",
          humanMembershipId: "member",
          session: { status: "ACTIVE" },
        }),
      },
      campaignInstanceHumanMembership: {
        findFirst: jest.fn().mockResolvedValue({
          activeCharacter: { characterId: "character", status: "ACTIVE" },
          campaignInstance: {
            runtime: { state, revision: 4 },
            currentSnapshot: { worldDefinitionSnapshot: { manifest: world } },
          },
        }),
      },
    };
    const service = new CampaignSessionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(
      (await service.participantSpatialBinding("instance", "session", "player"))
        .status,
    ).toBe("awaiting-visibility");
    expect(
      prisma.sessionParticipation.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      campaignInstanceId: "instance",
      sessionId: "session",
      selected: true,
      response: "ACCEPTED",
      humanMembership: { userId: "player", status: "ACTIVE" },
    });
    expect(
      prisma.campaignInstanceHumanMembership.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      id: "member",
      campaignInstanceId: "instance",
      userId: "player",
      status: "ACTIVE",
      role: "PLAYER",
    });
    prisma.sessionParticipation.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.participantSpatialBinding("instance", "session", "other"),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.sessionParticipation.findFirst.mockResolvedValueOnce({
      role: "SPECTATOR",
      humanMembershipId: "member",
      session: { status: "ACTIVE" },
    });
    expect(
      await service.participantSpatialBinding("instance", "session", "player"),
    ).toEqual({ status: "unavailable", reason: "not-player" });
  });
});

describe("actor placement runtime transaction", () => {
  it("audits valid setup and rejects active Sessions and lost revision races", async () => {
    const instance = {
      id: "instance",
      name: "Game",
      status: "PREPARING",
      currentSnapshotId: "snapshot",
      currentSnapshot: {
        worldDefinitionSnapshot: { manifest: world },
        campaignDefinitionSnapshot: {
          manifest: buildSnapshotManifest(1, [
            {
              resourceType: "campaign-definition-revision",
              sourceId: "campaign",
              sourceRevision: 1,
              payload: { name: "Campaign" },
            },
          ]),
        },
      },
      runtime: {
        id: "runtime",
        revision: 4,
        state: { ...state, creatureEmbodiments: [actor] },
      },
    };
    const client = {
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(instance) },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      campaignInstanceSession: { findFirst: jest.fn().mockResolvedValue(null) },
      campaignInstanceRuntime: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...client,
      $transaction: jest.fn(
        async (run: (tx: typeof client) => Promise<unknown>) => run(client),
      ),
    };
    const service = new CampaignInstanceManagementService(prisma as never);
    const command = {
      expectedRuntimeRevision: 4,
      locationId: "location",
      position: { x: 0.5, y: 0.5, z: 3.5 },
    };
    await service.placeActor("instance", "gm", "actor", command);
    expect(client.campaignInstanceRuntime.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "runtime", campaignInstanceId: "instance", revision: 4 },
      }),
    );
    expect(client.campaignInstanceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "instance.actor.placed",
          subjectName: "Hero",
        }),
      }),
    );
    client.campaignInstanceSession.findFirst.mockResolvedValueOnce({
      name: "Live Session",
    });
    await expect(
      service.placeActor("instance", "gm", "actor", command),
    ).rejects.toBeInstanceOf(ConflictException);
    client.campaignInstanceRuntime.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(
      service.placeActor("instance", "gm", "actor", command),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.campaignInstanceAuditEvent.create).toHaveBeenCalledTimes(1);
  });
});
