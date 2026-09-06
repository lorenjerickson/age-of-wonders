import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";

describe("CampaignInstanceManagementService", () => {
  const ownedInstance = {
    id: "instance-1",
    name: "Tuesday Glasswake",
    status: "PREPARING",
    currentSnapshotId: "snapshot-1",
    metadataRevision: 1,
    currentSnapshot: {
      campaignDefinitionSnapshot: {
        manifest: buildSnapshotManifest(1, [
          {
            resourceType: "campaign-definition-revision",
            sourceId: "campaign-revision-1",
            sourceRevision: 1,
            payload: { name: "Campaign" },
          },
        ]),
      },
      worldDefinitionSnapshot: {
        manifest: buildSnapshotManifest(1, [
          {
            resourceType: "world-definition-revision",
            sourceId: "world-revision-1",
            sourceRevision: 1,
            payload: { name: "World" },
          },
        ]),
      },
    },
    runtime: {
      id: "runtime-1",
      revision: 3,
      state: {
        formatVersion: 1,
        preparation: { startingContext: "Dock" },
        plotProgress: [],
        placementRealizations: [],
        creatureEmbodiments: [],
        itemInstances: [],
      },
    },
  };

  it("resolves continuation without recency or cross-Instance fallback", async () => {
    const prisma = {
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(ownedInstance) },
      campaignInstanceSession: {
        findMany: jest.fn().mockResolvedValue([
          { id: "paused", name: "The Return", status: "PAUSED", scheduledFor: null },
          { id: "planned", name: "Tomorrow", status: "PLANNED", scheduledFor: null },
        ]),
      },
    };
    const service = new CampaignInstanceManagementService(prisma as never);

    await expect(service.continuation("instance-1", "gm-1")).resolves.toEqual({
      campaignInstanceId: "instance-1",
      campaignInstanceName: "Tuesday Glasswake",
      kind: "resume",
      label: "Resume",
      enabled: true,
      detail: "The Return is paused.",
      session: { id: "paused", name: "The Return" },
    });
    expect(prisma.campaignInstanceSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          campaignInstanceId: "instance-1",
          status: { in: ["ACTIVE", "PAUSED", "PLANNED"] },
        },
        orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
      }),
    );
  });

  it("returns a chooser for multiple planned Sessions and a next step for none", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: "one", name: "One", status: "PLANNED", scheduledFor: null },
        { id: "two", name: "Two", status: "PLANNED", scheduledFor: null },
      ])
      .mockResolvedValueOnce([]);
    const service = new CampaignInstanceManagementService({
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(ownedInstance) },
      campaignInstanceSession: { findMany },
    } as never);
    await expect(service.continuation("instance-1", "gm-1")).resolves.toEqual({
      campaignInstanceId: "instance-1",
      campaignInstanceName: "Tuesday Glasswake",
      kind: "choose",
      label: "Choose Session",
      enabled: true,
      detail: "2 Sessions are eligible.",
    });
    await expect(service.continuation("instance-1", "gm-1")).resolves.toEqual({
      campaignInstanceId: "instance-1",
      campaignInstanceName: "Tuesday Glasswake",
      kind: "plan-session",
      label: "Plan a Session",
      enabled: false,
      detail: "Plan a Session before play can continue.",
    });
  });

  it("enforces strict lifecycle transitions through an owner-scoped CAS", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      campaignInstance: {
        findFirst: jest.fn().mockResolvedValue(ownedInstance),
        updateMany,
      },
      campaignInstanceHumanMembership: { count: jest.fn().mockResolvedValue(1) },
      campaignInstanceRuntime: { findUnique: jest.fn().mockResolvedValue(ownedInstance.runtime) },
    };
    const service = new CampaignInstanceManagementService(prisma as never);
    await expect(
      service.updateLifecycle("instance-1", "gm-1", {
        expectedMetadataRevision: 1,
        targetStatus: "active",
      }),
    ).resolves.toEqual({
      id: "instance-1",
      name: "Tuesday Glasswake",
      status: "active",
      metadataRevision: 2,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "instance-1",
        ownerUserId: "gm-1",
        status: "PREPARING",
        metadataRevision: 1,
      },
      data: {
        status: "ACTIVE",
        archivedAt: null,
        concludedAt: null,
        metadataRevision: { increment: 1 },
      },
    });

    await expect(
      service.updateLifecycle("instance-1", "gm-1", {
        expectedMetadataRevision: 1,
        targetStatus: "concluded",
      }),
    ).rejects.toEqual(
      new BadRequestException(
        "A preparing Campaign Instance cannot become concluded.",
      ),
    );
  });

  it("preserves runtime state and rejects stale preparation writes", async () => {
    const findFirst = jest.fn().mockResolvedValue(ownedInstance);
    const updateMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const prisma = {
      campaignInstance: { findFirst },
      campaignInstanceRuntime: { updateMany },
    };
    const service = new CampaignInstanceManagementService(prisma as never);
    await expect(
      service.updatePreparation("instance-1", "gm-1", {
        expectedRuntimeRevision: 3,
        preparation: { startingContext: " Observatory " },
      }),
    ).resolves.toEqual({
      campaignInstanceId: "instance-1",
      campaignInstanceName: "Tuesday Glasswake",
      runtimeRevision: 4,
      preparation: { startingContext: "Observatory" },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "runtime-1", campaignInstanceId: "instance-1", revision: 3 },
      data: {
        state: {
          formatVersion: 1,
          preparation: { startingContext: "Observatory" },
          plotProgress: [],
          placementRealizations: [],
          creatureEmbodiments: [],
          itemInstances: [],
        },
        revision: { increment: 1 },
      },
    });
    await expect(
      service.updatePreparation("instance-1", "gm-1", {
        expectedRuntimeRevision: 3,
        preparation: {},
      }),
    ).rejects.toEqual(new ConflictException("Instance runtime changed; reload and retry."));
  });

  it("projects bounded human-labeled replacement options for runtime Creatures and Items", async () => {
    const instance = {
      ...ownedInstance,
      runtime: {
        ...ownedInstance.runtime,
        state: {
          ...ownedInstance.runtime.state,
          creatureEmbodiments: [
            {
              runtimeCreatureId: "creature-opaque",
              creature: { name: "Harbor Warden" },
            },
          ],
          itemInstances: [
            { id: "item-opaque", nameOverride: "Signal Lantern" },
          ],
        },
      },
    };
    const service = new CampaignInstanceManagementService({
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(instance) },
    } as never);

    const result = await service.placements("instance-1", "gm-1");

    expect(result.replacementOptions).toEqual([
      expect.objectContaining({ name: "Harbor Warden", typeLabel: "Creature" }),
      expect.objectContaining({ name: "Signal Lantern", typeLabel: "Item" }),
    ]);
    expect(result).toMatchObject({
      totalReplacementOptions: 2,
      replacementOptionsTruncated: false,
    });
    expect(JSON.stringify(result.replacementOptions)).toContain("creature-opaque");
    expect(JSON.stringify(result.replacementOptions)).toContain("item-opaque");
  });

  it("uses neutral ownership failures", async () => {
    const service = new CampaignInstanceManagementService({
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);
    const secret = "foreign-opaque-instance";
    const operation = service.continuation(secret, "gm-1");
    await expect(operation).rejects.toEqual(
      new NotFoundException("The selected Campaign Instance was not found."),
    );
    await expect(operation).rejects.not.toThrow(secret);
  });

  it("lists only owner-scoped, bounded, human-labeled available Agents", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: "agent-1", name: "Plot Weaver", status: "ACTIVE" },
    ]);
    const service = new CampaignInstanceManagementService({
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(ownedInstance) },
      agentIdentity: { findMany },
    } as never);
    await expect(service.availableAgents("instance-1", "gm-1")).resolves.toEqual({
      campaignInstanceId: "instance-1",
      campaignInstanceName: "Tuesday Glasswake",
      items: [{ agentId: "agent-1", name: "Plot Weaver", status: "active" }],
      total: 1,
    });
    const query = JSON.stringify(findMany.mock.calls);
    expect(query).toContain('"ownerUserId":"gm-1"');
    expect(query).toContain('"take":200');
  });

  it("creates Agent participation once and rejects credential-like capabilities", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "participation-1",
      agentName: "Plot Weaver",
      status: "CONFIGURED",
    });
    const service = new CampaignInstanceManagementService({
      campaignInstance: { findFirst: jest.fn().mockResolvedValue(ownedInstance) },
      agentIdentity: {
        findFirst: jest.fn().mockResolvedValue({ id: "agent-1", name: "Plot Weaver" }),
      },
      campaignInstanceAgentParticipation: { create },
    } as never);
    await expect(
      service.configureAgent("instance-1", "gm-1", {
        agentId: "agent-1",
        observe: ["plot:suggest", "plot:suggest"],
        act: [],
      }),
    ).resolves.toMatchObject({
      agentName: "Plot Weaver",
      observeCapabilities: ["plot:suggest"],
    });
    expect(create).toHaveBeenCalledTimes(1);
    await expect(
      service.configureAgent("instance-1", "gm-1", {
        agentId: "agent-1",
        observe: ["plugin:session-token"],
        act: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
