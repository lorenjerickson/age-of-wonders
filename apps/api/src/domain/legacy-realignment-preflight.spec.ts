import { LegacyRealignmentPreflightService } from "./legacy-realignment-preflight";
import { DOMAIN_RESOURCES } from "./domain-resource";

const record = (
  resource: string,
  id: string,
  name: string,
  data: Record<string, unknown>,
  kind: string | null = null,
) => ({ resource, id, name, kind, data });

describe("LegacyRealignmentPreflightService", () => {
  it("proposes a deterministic Definition and Instance split without exposing identifiers", async () => {
    const prisma = {
      domainRecord: {
        findMany: jest.fn().mockResolvedValue([
          record(
            "locations",
            "world-secret-id",
            "Glasswake",
            {
              identity: { id: "world-secret-id" },
              name: "Glasswake",
              kind: "world",
              placement: { kind: "root" },
            },
            "world",
          ),
          record("campaigns", "campaign-secret-id", "Ashes at Dawn", {
            identity: { id: "campaign-secret-id" },
            name: "Ashes at Dawn",
            worldId: "world-secret-id",
          }),
          record(
            "games",
            "campaign-secret-id",
            "Ashes at Dawn",
            {
              campaign: {
                identity: { id: "campaign-secret-id" },
                name: "Ashes at Dawn",
              },
            },
            "game-state",
          ),
          record("sessions", "session-secret-id", "First Light", {
            identity: { id: "session-secret-id" },
            name: "First Light",
            worldId: "world-secret-id",
            campaignId: "campaign-secret-id",
          }),
          record("characters", "character-secret-id", "Mara", {
            identity: { id: "character-secret-id" },
            name: "Mara",
            ownerMembershipId: "membership-secret-id",
          }),
          record(
            "definitions",
            "definition-secret-id",
            "Glass Knife",
            {
              identity: { id: "definition-secret-id" },
              kind: "item",
              extensions: { "aow:worldId": "world-secret-id" },
            },
            "item",
          ),
          record("creatures", "creature-secret-id", "Glass Hound", {
            identity: { id: "creature-secret-id" },
            name: "Glass Hound",
            worldId: "world-secret-id",
          }),
          record("items", "item-secret-id", "Glass Knife", {
            id: "item-secret-id",
            extensions: { "aow:worldId": "world-secret-id" },
          }),
        ]),
      },
      campaignMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "membership-secret-id",
            campaignId: "campaign-secret-id",
            role: "PLAYER",
            status: "ACTIVE",
          },
        ]),
      },
      campaignInvitation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "invitation-secret-id",
            campaignId: "campaign-secret-id",
            role: "PLAYER",
            status: "PENDING",
          },
        ]),
      },
      characterCreationDraft: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "draft-secret-id",
            membershipId: "membership-secret-id",
            characterId: null,
            status: "IN_PROGRESS",
          },
        ]),
      },
    };

    const service = new LegacyRealignmentPreflightService(prisma);
    const first = await service.run();
    const second = await service.run();

    expect(first).toEqual(second);
    expect(first.mode).toBe("read-only");
    expect(first.inventory).toEqual({
      rootWorlds: 1,
      campaigns: 1,
      games: 1,
      sessions: 1,
      memberships: 1,
      invitations: 1,
      characterDrafts: 1,
      characters: 1,
      definitions: 1,
      creatures: 1,
      items: 1,
      otherDomainRecords: 0,
    });
    expect(first.mappingProposals).toEqual([
      expect.objectContaining({
        campaign: "Ashes at Dawn",
        world: "Glasswake",
        createCampaignDefinition: true,
        createCampaignInstance: true,
        dependents: {
          games: 1,
          sessions: 1,
          memberships: 1,
          invitations: 1,
          characterDrafts: 1,
          characters: 1,
        },
      }),
    ]);
    expect(JSON.stringify(first)).not.toMatch(
      /secret-id|token|email|phone|address/i,
    );
    expect(prisma.domainRecord.findMany).toHaveBeenCalledWith({
      where: {
        resource: {
          in: [...DOMAIN_RESOURCES],
        },
      },
      select: {
        resource: true,
        id: true,
        kind: true,
        name: true,
        data: true,
      },
      orderBy: [{ resource: "asc" }, { id: "asc" }],
    });
  });

  it("reports malformed and orphaned references with human-readable labels", async () => {
    const prisma = {
      domainRecord: {
        findMany: jest.fn().mockResolvedValue([
          record(
            "locations",
            "world-1",
            "Known World",
            {
              identity: { id: "world-1" },
              name: "Known World",
              kind: "world",
              placement: { kind: "root" },
            },
            "world",
          ),
          record("campaigns", "campaign-1", "Broken Campaign", {
            identity: { id: "campaign-1" },
            name: "Broken Campaign",
            worldId: "missing-world",
          }),
          record(
            "games",
            "game-1",
            "Orphaned runtime",
            {
              campaign: { identity: { id: "missing-campaign" } },
            },
            "game-state",
          ),
          record("sessions", "session-1", "Lost Session", {
            identity: { id: "session-1" },
            name: "Lost Session",
            campaignId: "missing-campaign",
          }),
          record("characters", "character-1", "Unbound Character", {
            identity: { id: "character-1" },
            name: "Unbound Character",
          }),
          record(
            "definitions",
            "definition-1",
            "Orphaned Definition",
            {
              identity: { id: "definition-1" },
              kind: "item",
              extensions: { "aow:worldId": "missing-world" },
            },
            "item",
          ),
          record("creatures", "creature-1", "Orphaned Creature", {
            identity: { id: "creature-1" },
            name: "Orphaned Creature",
            worldId: "missing-world",
          }),
          record("items", "item-1", "Orphaned Item", {
            id: "item-1",
            extensions: { "aow:worldId": "missing-world" },
          }),
        ]),
      },
      campaignMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "membership-1",
            campaignId: "missing-campaign",
            role: "PLAYER",
            status: "ACTIVE",
          },
        ]),
      },
      campaignInvitation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      characterCreationDraft: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "draft-1",
            membershipId: "missing-membership",
            characterId: null,
            status: "IN_PROGRESS",
          },
        ]),
      },
    };

    const report = await new LegacyRealignmentPreflightService(prisma).run();

    expect(report.readyForMigration).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "campaign-world-not-found",
      "character-membership-missing",
      "creature-world-not-found",
      "definition-world-not-found",
      "draft-membership-not-found",
      "game-campaign-not-found",
      "item-world-not-found",
      "membership-campaign-not-found",
      "session-campaign-not-found",
    ]);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: "Broken Campaign" }),
        expect.objectContaining({ subject: "Lost Session" }),
        expect.objectContaining({ subject: "Unbound Character" }),
      ]),
    );
    expect(JSON.stringify(report)).not.toContain("missing-campaign");
    expect(JSON.stringify(report)).not.toContain("missing-membership");
  });

  it("keeps equal canonical IDs distinct when their resources differ", async () => {
    const sharedId = "same-internal-id";
    const prisma = {
      domainRecord: {
        findMany: jest.fn().mockResolvedValue([
          record(
            "locations",
            "world-1",
            "Known World",
            {
              identity: { id: "world-1" },
              name: "Known World",
              kind: "world",
              placement: { kind: "root" },
            },
            "world",
          ),
          record(
            "definitions",
            sharedId,
            "Shared Definition Name",
            {
              identity: { id: sharedId },
              kind: "item",
              extensions: { "aow:worldId": "world-1" },
            },
            "item",
          ),
          record("creatures", sharedId, "Shared Creature Name", {
            identity: { id: sharedId },
            name: "Shared Creature Name",
            worldId: "world-1",
          }),
          record("items", sharedId, "Shared Item Name", {
            id: sharedId,
            extensions: { "aow:worldId": "world-1" },
          }),
        ]),
      },
      campaignMembership: { findMany: jest.fn().mockResolvedValue([]) },
      campaignInvitation: { findMany: jest.fn().mockResolvedValue([]) },
      characterCreationDraft: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const report = await new LegacyRealignmentPreflightService(prisma).run();

    expect(report.readyForMigration).toBe(true);
    expect(report.inventory).toMatchObject({
      definitions: 1,
      creatures: 1,
      items: 1,
    });
    expect(report.issues).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(sharedId);
  });

  it("queries only allowlisted non-sensitive fields and never invokes a write method", async () => {
    const write = jest.fn(() => {
      throw new Error("write attempted");
    });
    const prisma = {
      domainRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        create: write,
        update: write,
        updateMany: write,
        delete: write,
      },
      campaignMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        update: write,
      },
      campaignInvitation: {
        findMany: jest.fn().mockResolvedValue([]),
        update: write,
      },
      characterCreationDraft: {
        findMany: jest.fn().mockResolvedValue([]),
        update: write,
      },
    };

    await expect(
      new LegacyRealignmentPreflightService(prisma).run(),
    ).resolves.toMatchObject({ readyForMigration: true, issues: [] });
    expect(write).not.toHaveBeenCalled();
    expect(prisma.campaignMembership.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        campaignId: true,
        role: true,
        status: true,
      },
      orderBy: { id: "asc" },
    });
    expect(prisma.campaignInvitation.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        campaignId: true,
        role: true,
        status: true,
      },
      orderBy: { id: "asc" },
    });
  });
});
