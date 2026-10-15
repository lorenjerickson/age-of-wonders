import { GUARDS_METADATA } from "@nestjs/common/constants";
import { terrainShapePreset } from "@aow/common";
import { GmGuard } from "../auth/auth.guard";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
} from "../domain/snapshot-manifest";
import { CampaignSessionTableController } from "./campaign-session-table.controller";
import {
  CampaignSessionTableService,
  projectSessionTable,
  type SessionTableSource,
} from "./campaign-session-table.service";

function fixture(): SessionTableSource {
  const chunk = {
    address: { x: 0, y: 0, z: 0 },
    cells: [
      {
        offset: 0,
        materialKey: "terrain:stone",
        shape: terrainShapePreset("cube"),
      },
    ],
  };
  return {
    instanceId: "instance",
    sessionName: "Storm Warning",
    campaignInstanceName: "Tuesday crew",
    status: "active",
    runtimeRevision: 7,
    captured: {
      snapshotNumber: 2,
      world: { name: "Captured coast", revisionNumber: 3 },
      campaign: { name: "Captured voyage", revisionNumber: 4 },
    },
    worldManifest: buildSnapshotManifest(1, [
      {
        resourceType: "locations",
        sourceId: "harbor",
        sourceRevision: 1,
        payload: {
          name: "Old Harbor",
          description: "Captured description",
          map: {
            kind: "isometric",
            formatVersion: 1,
            dimensions: { x: 2, y: 2, z: 2 },
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
            chunks: [
              { address: chunk.address, contentHash: canonicalJsonHash(chunk) },
            ],
          },
        },
      },
      {
        resourceType: "locations",
        sourceId: "tower",
        sourceRevision: 1,
        payload: { name: "Tower" },
      },
      {
        resourceType: "location-terrain-chunks",
        sourceId: canonicalJsonHash(chunk),
        sourceRevision: 1,
        payload: chunk,
      },
    ]),
    campaignManifest: buildSnapshotManifest(1, [
      {
        resourceType: "plots",
        sourceId: "voyage",
        sourceRevision: 1,
        payload: {
          name: "Find the ship",
          parent: { kind: "root" },
          locationContexts: [{ locationId: "harbor" }],
          objectives: [{ id: "find", name: "Find a captain" }],
          pressures: [{ name: "Storm approaching" }],
          resistances: [{ name: "Closed docks" }],
          discoveries: [
            {
              name: "The captain's secret",
              claims: [
                {
                  id: "known",
                  kind: "truth",
                  statement: "The captain is hiding.",
                },
                {
                  id: "shared",
                  kind: "rumor",
                  statement: "The ship is haunted.",
                },
              ],
            },
          ],
        },
      },
      {
        resourceType: "plots",
        sourceId: "crew",
        sourceRevision: 1,
        payload: {
          name: "Recruit crew",
          parent: { kind: "subplot", parentPlotDefinitionId: "voyage" },
          locationContexts: [{ locationId: "tower" }],
        },
      },
    ]),
    state: {
      formatVersion: 1,
      campaignTime: "Day 3, dawn",
      preparation: { startingLocationId: "harbor" },
      creatureEmbodiments: [
        {
          campaignInstanceId: "instance",
          runtimeCreatureId: "hero",
          source: { kind: "character", characterId: "character" },
          creature: {
            name: "Runtime hero",
            currentLocationId: "harbor",
            terrainPosition: { x: 0.5, y: 0.5, z: 1 },
          },
        },
        {
          campaignInstanceId: "instance",
          runtimeCreatureId: "guard",
          source: { kind: "instance-created" },
          creature: { name: "Harbor guard", currentLocationId: "missing-id" },
        },
        {
          campaignInstanceId: "other",
          runtimeCreatureId: "foreign",
          creature: { name: "Foreign secret" },
        },
      ],
      plotProgress: [
        {
          campaignInstanceId: "instance",
          plotDefinitionId: "voyage",
          status: "active",
          objectiveProgress: [
            {
              objectiveId: "find",
              status: "completed",
              notes: "Spoke at dawn",
            },
          ],
          revealedClaimIds: ["shared"],
          creatureKnowledge: [
            { claimId: "known", creatureId: "hero", kind: "knows-truth" },
          ],
        },
      ],
    },
    characters: [{ id: "character", name: "River", playerName: "Taylor" }],
  };
}

describe("GM Session table", () => {
  it("projects the captured map, recursive Plot cues and Instance state without leaking unresolved labels or inferring shared knowledge", () => {
    const source = fixture();
    const result = projectSessionTable(source);
    expect(result.captured).toEqual(source.captured);
    expect(result.location).toMatchObject({
      name: "Old Harbor",
      description: "Captured description",
      mapStatus: "isometric",
      terrain: {
        kind: "isometric-terrain",
        chunks: [{ cells: [{ offset: 0 }] }],
      },
    });
    expect(result.focus).toBe("starting-location");
    expect(result.campaignTime).toBe("Day 3, dawn");
    expect(result.party.map((p) => [p.name, p.locationName])).toEqual([
      ["River", "Old Harbor"],
      ["Harbor guard", "Location unavailable"],
    ]);
    expect(result.plots[0]).toMatchObject({
      name: "Find the ship",
      status: "active",
      atFocusedLocation: true,
      objectives: [
        { name: "Find a captain", status: "completed", notes: "Spoke at dawn" },
      ],
      children: [{ name: "Recruit crew", atFocusedLocation: false }],
    });
    expect(
      result.plots[0].discoveries[0].claims.map((c) => c.revealed),
    ).toEqual([false, true]);
    expect(JSON.stringify(result)).not.toContain("missing-id");
    expect(JSON.stringify(result)).not.toContain("Foreign secret");
    expect(result.encounter.status).toBe("available");
  });

  it("changes only local map focus, rejects uncaptured choices and reports missing maps explicitly", () => {
    const source = fixture();
    const before = JSON.stringify(source);
    const result = projectSessionTable(source, "tower");
    expect(result.focus).toBe("requested");
    expect(result.location).toMatchObject({
      name: "Tower",
      mapStatus: "unavailable",
    });
    expect(result.party[0].atFocusedLocation).toBe(false);
    expect(result.plots[0].children[0].atFocusedLocation).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    expect(() => projectSessionTable(source, "upstream-only")).toThrow(
      "captured World",
    );
  });

  it("fails closed for missing terrain chunks and malformed captures", () => {
    const source = fixture();
    const world = source.worldManifest as ReturnType<
      typeof buildSnapshotManifest
    >;
    source.worldManifest = buildSnapshotManifest(
      1,
      world.records.filter((r) => r.resourceType !== "location-terrain-chunks"),
    );
    expect(projectSessionTable(source).location).toMatchObject({
      mapStatus: "unavailable",
      mapUnavailableReason: "The captured terrain could not be verified.",
    });
    source.worldManifest = null;
    const result = projectSessionTable(source);
    expect(result.location).toBeUndefined();
    expect(result.focus).toBe("unavailable");
    expect(result.unavailable).toContain(
      "Captured World content is unavailable.",
    );
  });

  it("guards the HTTP boundary and binds owner, Definition, Instance and Session in the same scoped read", async () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CampaignSessionTableController),
    ).toContain(GmGuard);
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      $transaction: jest.fn(
        (
          read: (tx: {
            campaignInstanceSession: { findFirst: typeof findFirst };
          }) => unknown,
        ) => read({ campaignInstanceSession: { findFirst } }),
      ),
    };
    const service = new CampaignSessionTableService(prisma as never);
    await expect(
      service.table("definition", "instance", "session", "owner"),
    ).rejects.toThrow("Session was not found");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "session",
          campaignInstanceId: "instance",
          campaignInstance: {
            campaignDefinitionId: "definition",
            ownerUserId: "owner",
          },
        },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    findFirst.mockResolvedValue({ status: "CONCLUDED" });
    await expect(
      service.table("definition", "instance", "session", "owner"),
    ).rejects.toThrow("active or paused");
  });

  it("reads captured revision names and manifests and active Character bindings without consulting upstream authoring", async () => {
    const source = fixture();
    const findFirst = jest.fn().mockResolvedValue({
      name: source.sessionName,
      status: "PAUSED",
      campaignInstance: {
        name: source.campaignInstanceName,
        runtime: { revision: source.runtimeRevision, state: source.state },
        currentSnapshot: {
          snapshotNumber: 2,
          worldDefinitionSnapshot: {
            manifest: source.worldManifest,
            worldDefinitionRevision: source.captured.world,
          },
          campaignDefinitionSnapshot: {
            manifest: source.campaignManifest,
            campaignDefinitionRevision: source.captured.campaign,
          },
        },
        humanMemberships: [
          {
            user: { displayName: "Taylor" },
            activeCharacter: {
              characterId: "character",
              characterName: "River",
              status: "ACTIVE",
            },
          },
        ],
      },
    });
    const service = new CampaignSessionTableService({
      $transaction: (read: (tx: unknown) => unknown) =>
        read({ campaignInstanceSession: { findFirst } }),
    } as never);
    const result = await service.table(
      "definition",
      "instance",
      "session",
      "owner",
    );
    expect(result.status).toBe("paused");
    expect(result.captured.world.name).toBe("Captured coast");
    expect(result.location?.name).toBe("Old Harbor");
    expect(result.party[0].name).toBe("River");
  });
});
