import { BadRequestException } from "@nestjs/common";
import { canTransitionCampaignSessionStatus } from "@aow/common";
import { CampaignSessionService } from "./campaign-session.service";

describe("Campaign Session contracts", () => {
  it.each([
    ["planned", "lobby", true],
    ["planned", "active", false],
    ["lobby", "planned", true],
    ["lobby", "active", true],
    ["active", "paused", true],
    ["paused", "active", true],
    ["active", "concluded", true],
    ["paused", "concluded", true],
    ["concluded", "active", false],
    ["cancelled", "lobby", false],
  ] as const)("validates %s → %s", (from, to, expected) => {
    expect(canTransitionCampaignSessionStatus(from, to)).toBe(expected);
  });

  it("rejects a Campaign Instance addressed beneath the wrong Definition", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new CampaignSessionService(
      { campaignInstance: { findFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.assertCampaignDefinitionParent(
        "different-definition",
        "instance-1",
        "gm-1",
      ),
    ).rejects.toThrow("The selected Campaign Instance was not found.");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "instance-1",
        campaignDefinitionId: "different-definition",
        ownerUserId: "gm-1",
      },
      select: { id: true },
    });
  });

  it("keeps required Player readiness separate from optional Spectator presence", async () => {
    const prisma = {
      campaignInstance: {
        findFirst: jest.fn().mockResolvedValue({
          id: "instance-1",
          name: "Tuesday Glasswake",
          status: "ACTIVE",
          currentSnapshotId: "snapshot-1",
          runtime: { revision: 4 },
          owner: { displayName: "Morgan" },
        }),
      },
      campaignInstanceSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: "session-1",
          campaignInstanceId: "instance-1",
          name: "Storm Warning",
          status: "LOBBY",
          metadataRevision: 2,
          lastEventSequence: 1,
          participations: [
            {
              id: "gm",
              participantName: "Morgan",
              role: "GM",
              required: true,
              response: "ACCEPTED",
              humanMembership: { status: "ACTIVE", activeCharacter: null },
              agentParticipation: null,
              presenceLeases: [{}],
            },
            {
              id: "player",
              participantName: "River",
              role: "PLAYER",
              required: true,
              response: "ACCEPTED",
              humanMembership: {
                status: "ACTIVE",
                activeCharacter: { status: "DRAFT" },
              },
              agentParticipation: null,
              presenceLeases: [{}],
            },
            {
              id: "spectator",
              participantName: "Avery",
              role: "SPECTATOR",
              required: false,
              response: "ACCEPTED",
              humanMembership: { status: "ACTIVE", activeCharacter: null },
              agentParticipation: null,
              presenceLeases: [],
            },
          ],
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
    const result = await service.readiness("instance-1", "session-1", "gm-1");

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "River", status: "blocked" }),
      ]),
    );
    expect(result.checks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Avery", status: "blocked" }),
      ]),
    );
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects forbidden lifecycle transitions before writing history", async () => {
    const row = {
      id: "session-1",
      campaignInstanceId: "instance-1",
      name: "Finished Business",
      status: "CONCLUDED",
      metadataRevision: 5,
      lastEventSequence: 9,
      participations: [],
    };
    const client = {
      $executeRawUnsafe: jest.fn(),
      campaignInstance: {
        findFirst: jest.fn().mockResolvedValue({
          id: "instance-1",
          name: "Tuesday Glasswake",
          status: "ACTIVE",
          currentSnapshotId: "snapshot-1",
          runtime: { revision: 4 },
          owner: { displayName: "Morgan" },
        }),
      },
      campaignInstanceSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findFirstOrThrow: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      campaignInstance: {
        findFirst: jest.fn().mockResolvedValue({
          id: "instance-1",
          name: "Tuesday Glasswake",
          status: "ACTIVE",
          currentSnapshotId: "snapshot-1",
          runtime: { revision: 4 },
          owner: { displayName: "Morgan" },
        }),
      },
      $transaction: jest.fn((operation: (tx: typeof client) => unknown) =>
        operation(client),
      ),
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

    await expect(
      service.command("instance-1", "session-1", "gm-1", "resume", {
        expectedMetadataRevision: 5,
        expectedRuntimeRevision: 4,
        readinessToken: "stale",
      }),
    ).rejects.toEqual(
      new BadRequestException("A concluded Session cannot resume."),
    );
    expect(client.campaignInstanceSession.updateMany).not.toHaveBeenCalled();
  });

  it("filters participant event history by the current Instance role", async () => {
    const findMany = jest.fn(
      (input: {
        where: {
          campaignInstanceId: string;
          sessionId: string;
          visibility: { in: string[] };
        };
      }) => {
        void input;
        return Promise.resolve([]);
      },
    );
    const prisma = {
      sessionParticipation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "spectator-participation",
          role: "SPECTATOR",
          participantName: "Avery",
          response: "ACCEPTED",
          session: { name: "Storm Warning", status: "ACTIVE" },
        }),
      },
      campaignSessionEvent: { findMany },
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

    await service.participantEvents("instance-1", "session-1", "user-1");

    expect(findMany.mock.calls[0]?.[0].where).toEqual({
      campaignInstanceId: "instance-1",
      sessionId: "session-1",
      sequence: { gt: 0 },
      visibility: {
        in: ["PARTICIPANTS", "SESSION_PUBLIC", "SPECTATORS"],
      },
    });
  });

  it("requires active server standing for participant Session projections", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new CampaignSessionService(
      { sessionParticipation: { findFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.participantProjection("instance-1", "session-1", "user-1"),
    ).rejects.toThrow("You are not invited to this Session.");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        campaignInstanceId: "instance-1",
        sessionId: "session-1",
        selected: true,
        response: "ACCEPTED",
        humanMembership: {
          userId: "user-1",
          status: "ACTIVE",
          OR: [
            { role: "GM" },
            { user: { playerProfile: { standing: "ACTIVE" } } },
          ],
        },
      },
      include: {
        session: {
          select: { name: true, status: true, lastEventSequence: true },
        },
      },
    });
  });

  it("preserves separate observe and act grants in the GM Session projection", async () => {
    const service = new CampaignSessionService(
      {
        campaignInstance: {
          findFirst: jest.fn().mockResolvedValue({
            id: "instance-1",
            name: "Tuesday Glasswake",
            status: "ACTIVE",
            currentSnapshotId: "snapshot-1",
            runtime: { revision: 4 },
            owner: { displayName: "Morgan" },
          }),
        },
        campaignInstanceSession: {
          findFirst: jest.fn().mockResolvedValue({
            id: "session-1",
            campaignInstanceId: "instance-1",
            name: "Storm Warning",
            status: "LOBBY",
            metadataRevision: 2,
            participations: [
              {
                id: "agent-participation",
                participantName: "Chronicler",
                role: "AGENT",
                required: false,
                response: "ACCEPTED",
                attendance: "PENDING",
                observeCapabilities: ["aow:event-stream"],
                actCapabilities: ["aow:draft-narrative"],
                humanMembership: null,
                presenceLeases: [],
              },
            ],
            runtimeBoundaries: [],
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.detail("instance-1", "session-1", "gm-1");
    expect(result.participants[0]).toMatchObject({
      name: "Chronicler",
      observeCapabilities: ["aow:event-stream"],
      actCapabilities: ["aow:draft-narrative"],
    });
  });

  it("rejects an Agent with grants outside the core Session registry", async () => {
    const service = new CampaignSessionService(
      {
        campaignInstance: {
          findFirst: jest.fn().mockResolvedValue({
            id: "instance-1",
            name: "Tuesday Glasswake",
            status: "ACTIVE",
            currentSnapshotId: "snapshot-1",
            runtime: { revision: 4 },
            owner: { displayName: "Morgan" },
          }),
        },
        campaignInstanceSession: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        campaignInstanceHumanMembership: {
          findFirst: jest.fn().mockResolvedValue({
            id: "gm-membership",
            displayName: "Morgan",
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        campaignInstanceAgentParticipation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "agent-participation",
              agentName: "Overreaching Agent",
              observeCapabilities: ["runtime:write-all"],
              actCapabilities: [],
            },
          ]),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create("instance-1", "gm-1", {
        idempotencyKey: "create-session-1",
        name: "Storm Warning",
        agentParticipationIds: ["agent-participation" as never],
      }),
    ).rejects.toThrow(
      "The selected Agent has capabilities outside the core Session registry.",
    );
  });

  it("accepts a Session invitation and creates participant authentication atomically", async () => {
    const invitation = {
      id: "invitation-1",
      campaignInstanceId: "instance-1",
      sessionId: "session-1",
      participationId: "participation-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
      participation: {
        participantName: "River",
        selected: true,
        humanMembership: { userId: "user-1" },
      },
      session: {
        name: "Storm Warning",
        status: "LOBBY",
        campaignInstance: { name: "Tuesday Glasswake" },
      },
    };
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      campaignSessionInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          participationId: "participation-1",
          participation: { participantName: "River" },
          session: { lastEventSequence: 0 },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      sessionParticipation: { update: jest.fn().mockResolvedValue({}) },
      campaignInstanceSession: { update: jest.fn().mockResolvedValue({}) },
      campaignSessionEvent: { create: jest.fn().mockResolvedValue({}) },
      authSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      campaignSessionInvitation: {
        findUnique: jest.fn().mockResolvedValue(invitation),
      },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const service = new CampaignSessionService(
      prisma as never,
      { hash: jest.fn(() => "token-hash") } as never,
      {} as never,
      {} as never,
      {
        prepareSession: jest.fn(() => ({
          token: "participant-session-token",
          data: {
            userId: "user-1",
            tokenHash: "session-hash",
            expiresAt: new Date(Date.now() + 60_000),
          },
        })),
      } as never,
      {} as never,
      {} as never,
    );

    const result = await service.respondToInvitation(
      "invitation-token-long-enough",
      "accepted",
    );

    expect(tx.authSession.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      campaignInstanceName: "Tuesday Glasswake",
      sessionName: "Storm Warning",
      participantName: "River",
      response: "accepted",
      sessionToken: "participant-session-token",
      lobbyHref: "/play/instances/instance-1/sessions/session-1",
    });
  });

  it("rechecks the lobby while holding the lifecycle lock before issuing invitations", async () => {
    const lock = jest.fn().mockResolvedValue(0);
    const findSession = jest.fn().mockResolvedValue({
      name: "Storm Warning",
      status: "PLANNED",
      lastEventSequence: 1,
    });
    const tx = {
      $executeRawUnsafe: lock,
      campaignInstanceSession: { findFirst: findSession },
    };
    const service = new CampaignSessionService(
      {
        campaignInstance: {
          findFirst: jest.fn().mockResolvedValue({
            id: "instance-1",
            name: "Tuesday Glasswake",
            status: "ACTIVE",
            currentSnapshotId: "snapshot-1",
            runtime: { revision: 1, state: {} },
            currentSnapshot: null,
            owner: { displayName: "Morgan" },
          }),
        },
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as never,
      {} as never,
      { get: jest.fn((_key: string, fallback: unknown) => fallback) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.issueInvitations("instance-1", "session-1", "gm-1"),
    ).rejects.toThrow("Open the lobby");
    expect(lock).toHaveBeenCalledTimes(1);
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      findSession.mock.invocationCallOrder[0],
    );
  });

  it("serializes presence joins and binds equal connection keys to each participant", async () => {
    const lock = jest.fn().mockResolvedValue(0);
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: "participant-1",
        participantName: "River",
        response: "ACCEPTED",
        joinedAt: null,
        session: {
          name: "Storm Warning",
          status: "ACTIVE",
          lastEventSequence: 0,
        },
      })
      .mockResolvedValueOnce({
        id: "participant-2",
        participantName: "Avery",
        response: "ACCEPTED",
        joinedAt: null,
        session: {
          name: "Storm Warning",
          status: "ACTIVE",
          lastEventSequence: 1,
        },
      });
    const upsert = jest.fn(
      (input: {
        where: { connectionKeyHash: string };
        create: { participationId: string };
      }) => Promise.resolve({ expiresAt: new Date(), input }),
    );
    const tx = {
      $executeRawUnsafe: lock,
      sessionParticipation: {
        findFirst,
        update: jest.fn().mockResolvedValue({}),
      },
      sessionPresenceLease: { upsert },
      campaignInstanceSession: { update: jest.fn().mockResolvedValue({}) },
      campaignSessionEvent: {
        findUnique: jest.fn().mockResolvedValue({ contentHash: "prior" }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new CampaignSessionService(
      {
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.join("instance-1", "session-1", "user-1", "same-key");
    await service.join("instance-1", "session-1", "user-2", "same-key");

    expect(lock).toHaveBeenCalledTimes(2);
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0],
    );
    const firstHash = upsert.mock.calls[0]?.[0].where.connectionKeyHash;
    const secondHash = upsert.mock.calls[1]?.[0].where.connectionKeyHash;
    expect(firstHash).not.toBe(secondHash);
    expect(upsert.mock.calls[0]?.[0].create.participationId).toBe(
      "participant-1",
    );
    expect(upsert.mock.calls[1]?.[0].create.participationId).toBe(
      "participant-2",
    );
  });

  it("rejects presence after Session sealing before claiming a lease", async () => {
    const upsert = jest.fn();
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      sessionParticipation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "participant-1",
          participantName: "River",
          response: "ACCEPTED",
          joinedAt: null,
          session: { name: "Storm Warning", status: "CONCLUDED" },
        }),
      },
      sessionPresenceLease: { upsert },
    };
    const service = new CampaignSessionService(
      {
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.join("instance-1", "session-1", "user-1", "connection"),
    ).rejects.toThrow("not accepting participants");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects heartbeat when the invitation response is not accepted", async () => {
    const updateMany = jest.fn();
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      sessionParticipation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "participant-1",
          participantName: "River",
          response: "DECLINED",
          session: { name: "Storm Warning", status: "LOBBY" },
        }),
      },
      sessionPresenceLease: { updateMany },
    };
    const service = new CampaignSessionService(
      {
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.heartbeat("instance-1", "session-1", "user-1", "connection"),
    ).rejects.toThrow("Accept the Session invitation");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("caps atomic leave duration at lease expiry", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-05T12:02:00.000Z"));
    let durationIncrement = -1;
    const participationUpdate = jest.fn(
      (input: { data: { totalPresentSeconds: { increment: number } } }) => {
        durationIncrement = input.data.totalPresentSeconds.increment;
        return Promise.resolve({});
      },
    );
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      sessionParticipation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "participant-1",
          participantName: "River",
          response: "ACCEPTED",
          session: {
            name: "Storm Warning",
            status: "ACTIVE",
            lastEventSequence: 0,
          },
        }),
        update: participationUpdate,
      },
      sessionPresenceLease: {
        findFirst: jest.fn().mockResolvedValue({
          joinedAt: new Date("2026-09-05T12:00:00.000Z"),
          expiresAt: new Date("2026-09-05T12:00:30.000Z"),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      campaignInstanceSession: { update: jest.fn().mockResolvedValue({}) },
      campaignSessionEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new CampaignSessionService(
      {
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.leave("instance-1", "session-1", "user-1", "connection");

    expect(participationUpdate).toHaveBeenCalledTimes(1);
    expect(durationIncrement).toBe(30);
    jest.useRealTimers();
  });
});
