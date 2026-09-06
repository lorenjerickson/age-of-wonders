import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConflictException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { CampaignInstanceMigrationsService } from "./campaign-instance-migrations.service";
import { CampaignSessionService } from "./campaign-session.service";

const databaseUrl = process.env.CAMPAIGN_INSTANCE_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

interface Fixture {
  readonly ownerUserId: string;
  readonly campaignInstanceId: string;
  readonly sourceSnapshotId: string;
  readonly targetCampaignDefinitionSnapshotId: string;
  readonly runtimeId: string;
  readonly sessionId: string;
}

describePostgres("Campaign Instance migration PostgreSQL transactions", () => {
  let prisma!: PrismaClient;
  let service!: CampaignInstanceMigrationsService;
  let sessions!: CampaignSessionService;

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error("PostgreSQL test database is unavailable.");
    assertDisposableDatabase(databaseUrl);
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    service = new CampaignInstanceMigrationsService(prisma as never);
    sessions = new CampaignSessionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("waits for an in-flight Session activation, then rejects migration without writes", async () => {
    const fixture = await seedFixture(prisma);
    const request = await migrationRequest(service, fixture);
    let releaseActivation!: () => void;
    let activationWritten!: () => void;
    const holdActivation = new Promise<void>((resolve) => {
      releaseActivation = resolve;
    });
    const wroteActivation = new Promise<void>((resolve) => {
      activationWritten = resolve;
    });

    const activation = prisma.$transaction(
      async (tx) => {
        await tx.campaignInstanceSession.update({
          where: { id: fixture.sessionId },
          data: { status: "ACTIVE", startedAt: new Date() },
        });
        activationWritten();
        await holdActivation;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    await wroteActivation;

    let migrationSettled = false;
    const migration = service
      .apply(fixture.campaignInstanceId, fixture.ownerUserId, request)
      .finally(() => {
        migrationSettled = true;
      });
    await delay(150);
    expect(migrationSettled).toBe(false);

    releaseActivation();
    await activation;
    await expect(migration).rejects.toBeInstanceOf(ConflictException);
    await expectUnchanged(prisma, fixture);
    await pauseSession(prisma, fixture.sessionId);
  }, 40_000);

  it("serializes Session activation after a migration that already holds the Session lock", async () => {
    const fixture = await seedFixture(prisma);
    const request = await migrationRequest(service, fixture);
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `hold_checkpoint_${suffix}`;
    const triggerName = `hold_checkpoint_${suffix}`;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $function$
      BEGIN
        IF NEW."campaignInstanceId" = '${fixture.campaignInstanceId}' THEN
          PERFORM pg_advisory_xact_lock(hashtext(NEW."campaignInstanceId"));
        END IF;
        RETURN NEW;
      END;
      $function$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "CampaignInstanceRuntimeCheckpoint"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);
    let releaseGate!: () => void;
    let gateAcquired!: () => void;
    const holdGate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const acquiredGate = new Promise<void>((resolve) => {
      gateAcquired = resolve;
    });
    const gate = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${fixture.campaignInstanceId}))::text AS locked
        `;
        gateAcquired();
        await holdGate;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    await acquiredGate;
    const migration = service.apply(
      fixture.campaignInstanceId,
      fixture.ownerUserId,
      request,
    );
    await waitForCheckpointAdvisoryWait(prisma);

    let activationSettled = false;
    const activation = prisma
      .$transaction(
        (tx) =>
          tx.campaignInstanceSession.update({
            where: { id: fixture.sessionId },
            data: { status: "ACTIVE", startedAt: new Date() },
          }),
        { maxWait: 10_000, timeout: 30_000 },
      )
      .finally(() => {
        activationSettled = true;
      });
    await delay(150);
    expect(activationSettled).toBe(false);

    releaseGate();
    await gate;
    const migrated = await migration;
    expect(migrated.runtimeRevision).toBe(2);
    await activation;
    await expectMigrated(prisma, fixture);
    await pauseSession(prisma, fixture.sessionId);
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "CampaignInstanceRuntimeCheckpoint"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${functionName}"()`,
    );
  }, 40_000);

  it("allows exactly one concurrent migration and reports the stale contender", async () => {
    const fixture = await seedFixture(prisma);
    const request = await migrationRequest(service, fixture);
    const outcomes = await Promise.allSettled([
      service.apply(fixture.campaignInstanceId, fixture.ownerUserId, request),
      service.apply(fixture.campaignInstanceId, fixture.ownerUserId, request),
    ]);

    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictException);
    await expectMigrated(prisma, fixture);
  }, 40_000);

  it("rolls back snapshot, runtime, checkpoints, and audits after a late write failure", async () => {
    const fixture = await seedFixture(prisma);
    const request = await migrationRequest(service, fixture);
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `fail_late_campaign_instance_${suffix}`;
    const triggerName = `fail_late_campaign_instance_${suffix}`;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $function$
      BEGIN
        IF NEW."campaignInstanceId" = '${fixture.campaignInstanceId}' THEN
          RAISE EXCEPTION 'forced late Campaign Instance migration failure';
      END IF;
      RETURN NEW;
      END;
      $function$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "CampaignInstanceAuditEvent"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);

    try {
      await expect(
        service.apply(fixture.campaignInstanceId, fixture.ownerUserId, request),
      ).rejects.toThrow("forced late Campaign Instance migration failure");
      await expectUnchanged(prisma, fixture);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "CampaignInstanceAuditEvent"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS "${functionName}"()`,
      );
    }
  }, 40_000);

  it("creates one logical Session under concurrent idempotent retries", async () => {
    const fixture = await seedFixture(prisma);
    const request = {
      idempotencyKey: `session-create-${randomUUID()}`,
      name: "Concurrent planning",
    };
    const results = await Promise.all([
      sessions.create(fixture.campaignInstanceId, fixture.ownerUserId, request),
      sessions.create(fixture.campaignInstanceId, fixture.ownerUserId, request),
    ]);

    expect(results[0].id).toBe(results[1].id);
    await expect(
      prisma.campaignInstanceSession.count({
        where: {
          campaignInstanceId: fixture.campaignInstanceId,
          name: "Concurrent planning",
        },
      }),
    ).resolves.toBe(1);
  }, 40_000);

  it("allows multiple paused Sessions while rejecting a second active Session", async () => {
    const fixture = await seedFixture(prisma);
    const now = new Date();
    const secondPausedId = `${fixture.sessionId}-second-paused`;
    await prisma.campaignInstanceSession.update({
      where: { id: fixture.sessionId },
      data: { status: "PAUSED", startedAt: now, pausedAt: now },
    });
    await prisma.campaignInstanceSession.create({
      data: {
        id: secondPausedId,
        campaignInstanceId: fixture.campaignInstanceId,
        name: "Second paused Session",
        status: "PAUSED",
        startedAt: now,
        pausedAt: now,
      },
    });
    await expect(
      prisma.campaignInstanceSession.count({
        where: {
          id: { in: [fixture.sessionId, secondPausedId] },
          status: "PAUSED",
        },
      }),
    ).resolves.toBe(2);

    try {
      await prisma.campaignInstanceSession.update({
        where: { id: fixture.sessionId },
        data: { status: "ACTIVE", pausedAt: null },
      });
      await expect(
        prisma.campaignInstanceSession.update({
          where: { id: secondPausedId },
          data: { status: "ACTIVE", pausedAt: null },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await prisma.campaignInstanceSession.update({
        where: { id: fixture.sessionId },
        data: { status: "PAUSED", pausedAt: now },
      });
    }
  }, 40_000);

  it("rejects ambiguous Player contact hashes before creating unique indexes", async () => {
    const prefix = `contact-preflight-${randomUUID()}`;
    const preflight = playerProfileContactPreflightSql();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('DROP INDEX "PlayerProfile_emailHash_key"');
        await tx.user.createMany({
          data: [
            {
              id: `${prefix}-first-user`,
              displayName: "First contact",
              role: "PARTICIPANT",
            },
            {
              id: `${prefix}-second-user`,
              displayName: "Second contact",
              role: "PARTICIPANT",
            },
          ],
        });
        await tx.playerProfile.createMany({
          data: [
            {
              id: `${prefix}-first-profile`,
              userId: `${prefix}-first-user`,
              displayName: "First contact",
              emailHash: `${prefix}-duplicate-email`,
            },
            {
              id: `${prefix}-second-profile`,
              userId: `${prefix}-second-user`,
              displayName: "Second contact",
              emailHash: `${prefix}-duplicate-email`,
            },
          ],
        });
        await tx.$executeRawUnsafe(preflight);
      }),
    ).rejects.toThrow(
      "Player profiles contain 1 duplicate email-hash groups across 2 profiles and 0 duplicate phone-hash groups across 0 profiles",
    );
  }, 40_000);

  it("enforces unique non-null Player email and phone hashes", async () => {
    const prefix = `contact-unique-${randomUUID()}`;
    await prisma.user.createMany({
      data: [
        {
          id: `${prefix}-first-user`,
          displayName: "First unique contact",
          role: "PARTICIPANT",
        },
        {
          id: `${prefix}-second-user`,
          displayName: "Second unique contact",
          role: "PARTICIPANT",
        },
        {
          id: `${prefix}-third-user`,
          displayName: "Third unique contact",
          role: "PARTICIPANT",
        },
        {
          id: `${prefix}-fourth-user`,
          displayName: "Fourth unique contact",
          role: "PARTICIPANT",
        },
      ],
    });
    await prisma.playerProfile.create({
      data: {
        userId: `${prefix}-first-user`,
        displayName: "First unique contact",
        emailHash: `${prefix}-email`,
      },
    });
    await expect(
      prisma.playerProfile.create({
        data: {
          userId: `${prefix}-second-user`,
          displayName: "Second unique contact",
          emailHash: `${prefix}-email`,
        },
      }),
    ).rejects.toThrow();
    await prisma.playerProfile.create({
      data: {
        userId: `${prefix}-third-user`,
        displayName: "Third unique contact",
        phoneHash: `${prefix}-phone`,
      },
    });
    await expect(
      prisma.playerProfile.create({
        data: {
          userId: `${prefix}-fourth-user`,
          displayName: "Fourth unique contact",
          phoneHash: `${prefix}-phone`,
        },
      }),
    ).rejects.toThrow();
  }, 40_000);

  it("enforces Session and invitation lifecycle shapes in PostgreSQL", async () => {
    const fixture = await seedFixture(prisma);
    await expect(
      prisma.campaignInstanceSession.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          name: "Invalid lobby",
          status: "LOBBY",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.campaignSessionRuntimeBoundary.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          sessionId: fixture.sessionId,
          snapshotId: fixture.sourceSnapshotId,
          runtimeRevision: 0,
          reason: "START",
          eventSequence: 1,
          contentHash: "invalid-runtime-revision",
          actorUserId: fixture.ownerUserId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.campaignInstanceSession.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          name: "Invalid revision",
          metadataRevision: 0,
        },
      }),
    ).rejects.toThrow();

    const session = await sessions.create(
      fixture.campaignInstanceId,
      fixture.ownerUserId,
      {
        idempotencyKey: `invitation-shape-${randomUUID()}`,
        name: "Invitation shape checks",
      },
    );
    const participation = await prisma.sessionParticipation.findFirstOrThrow({
      where: { sessionId: session.id, role: "GM" },
    });
    const issuedAt = new Date();
    await expect(
      prisma.campaignSessionInvitation.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          sessionId: session.id,
          participationId: participation.id,
          revision: 0,
          tokenHash: `invalid-revision-${randomUUID()}`,
          issuedByUserId: fixture.ownerUserId,
          issuedAt,
          expiresAt: new Date(issuedAt.getTime() + 60_000),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.campaignSessionInvitation.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          sessionId: session.id,
          participationId: participation.id,
          tokenHash: `invalid-expiry-${randomUUID()}`,
          issuedByUserId: fixture.ownerUserId,
          issuedAt,
          expiresAt: issuedAt,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.campaignSessionInvitation.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          sessionId: session.id,
          participationId: participation.id,
          tokenHash: `invalid-accepted-status-${randomUUID()}`,
          status: "ACCEPTED",
          issuedByUserId: fixture.ownerUserId,
          issuedAt,
          expiresAt: new Date(issuedAt.getTime() + 60_000),
        },
      }),
    ).rejects.toThrow();
  }, 40_000);

  it("enforces one pending invitation and same-participation predecessor lineage", async () => {
    const fixture = await seedFixture(prisma);
    const firstSession = await sessions.create(
      fixture.campaignInstanceId,
      fixture.ownerUserId,
      {
        idempotencyKey: `first-lineage-${randomUUID()}`,
        name: "First invitation lineage",
      },
    );
    const firstParticipation =
      await prisma.sessionParticipation.findFirstOrThrow({
        where: { sessionId: firstSession.id, role: "GM" },
      });
    const now = new Date();
    const firstInvitation = await prisma.campaignSessionInvitation.create({
      data: {
        campaignInstanceId: fixture.campaignInstanceId,
        sessionId: firstSession.id,
        participationId: firstParticipation.id,
        tokenHash: `first-pending-${randomUUID()}`,
        issuedByUserId: fixture.ownerUserId,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });
    await expect(
      prisma.campaignSessionInvitation.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          sessionId: firstSession.id,
          participationId: firstParticipation.id,
          revision: 2,
          predecessorInvitationId: firstInvitation.id,
          tokenHash: `duplicate-pending-${randomUUID()}`,
          issuedByUserId: fixture.ownerUserId,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
        },
      }),
    ).rejects.toThrow();

    await prisma.campaignSessionInvitation.update({
      where: { id: firstInvitation.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const secondSession = await sessions.create(
      fixture.campaignInstanceId,
      fixture.ownerUserId,
      {
        idempotencyKey: `second-lineage-${randomUUID()}`,
        name: "Second invitation lineage",
      },
    );
    const secondParticipation =
      await prisma.sessionParticipation.findFirstOrThrow({
        where: { sessionId: secondSession.id, role: "GM" },
      });
    await expect(
      prisma.campaignSessionInvitation.create({
        data: {
          campaignInstanceId: fixture.campaignInstanceId,
          sessionId: secondSession.id,
          participationId: secondParticipation.id,
          revision: 2,
          predecessorInvitationId: firstInvitation.id,
          tokenHash: `cross-scope-predecessor-${randomUUID()}`,
          issuedByUserId: fixture.ownerUserId,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
        },
      }),
    ).rejects.toThrow();
  }, 40_000);

  it("allows exactly one of two ready lobbies to start", async () => {
    const fixture = await seedFixture(prisma);
    const first = await sessions.create(
      fixture.campaignInstanceId,
      fixture.ownerUserId,
      {
        idempotencyKey: `first-lobby-${randomUUID()}`,
        name: "First ready lobby",
      },
    );
    const second = await sessions.create(
      fixture.campaignInstanceId,
      fixture.ownerUserId,
      {
        idempotencyKey: `second-lobby-${randomUUID()}`,
        name: "Second ready lobby",
      },
    );
    const firstLobby = await sessions.command(
      fixture.campaignInstanceId,
      first.id,
      fixture.ownerUserId,
      "open-lobby",
      { expectedMetadataRevision: first.metadataRevision },
    );
    const secondLobby = await sessions.command(
      fixture.campaignInstanceId,
      second.id,
      fixture.ownerUserId,
      "open-lobby",
      { expectedMetadataRevision: second.metadataRevision },
    );
    await Promise.all([
      sessions.join(
        fixture.campaignInstanceId,
        first.id,
        fixture.ownerUserId,
        `presence-first-${randomUUID()}`,
      ),
      sessions.join(
        fixture.campaignInstanceId,
        second.id,
        fixture.ownerUserId,
        `presence-second-${randomUUID()}`,
      ),
    ]);
    const [firstReady, secondReady] = await Promise.all([
      sessions.readiness(
        fixture.campaignInstanceId,
        first.id,
        fixture.ownerUserId,
      ),
      sessions.readiness(
        fixture.campaignInstanceId,
        second.id,
        fixture.ownerUserId,
      ),
    ]);
    const outcomes = await Promise.allSettled([
      sessions.command(
        fixture.campaignInstanceId,
        first.id,
        fixture.ownerUserId,
        "start",
        {
          expectedMetadataRevision: firstLobby.metadataRevision,
          expectedRuntimeRevision: firstReady.runtimeRevision,
          readinessToken: firstReady.token,
        },
      ),
      sessions.command(
        fixture.campaignInstanceId,
        second.id,
        fixture.ownerUserId,
        "start",
        {
          expectedMetadataRevision: secondLobby.metadataRevision,
          expectedRuntimeRevision: secondReady.runtimeRevision,
          readinessToken: secondReady.token,
        },
      ),
    ]);

    const fulfilled = outcomes.filter(
      (
        outcome,
      ): outcome is PromiseFulfilledResult<
        Awaited<ReturnType<typeof sessions.command>>
      > => outcome.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    const winner = fulfilled[0].value;
    await sessions.command(
      fixture.campaignInstanceId,
      winner.id,
      fixture.ownerUserId,
      "conclude",
      { expectedMetadataRevision: winner.metadataRevision },
    );
    await expect(
      prisma.campaignSessionEvent.updateMany({
        where: { sessionId: winner.id },
        data: { summary: "Mutation must fail" },
      }),
    ).rejects.toThrow("Campaign Session history is append-only");
  }, 40_000);

  it("rolls back summary approval when the late outbox write fails", async () => {
    const fixture = await seedFixture(prisma);
    const concluded = await createAndConcludeSession(
      sessions,
      fixture,
      "Summary rollback",
    );
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `fail_session_outbox_${suffix}`;
    const triggerName = `fail_session_outbox_${suffix}`;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $function$
      BEGIN
        IF NEW."campaignInstanceId" = '${fixture.campaignInstanceId}' THEN
          RAISE EXCEPTION 'forced late Session outbox failure';
        END IF;
        RETURN NEW;
      END;
      $function$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "CampaignSessionOutboxEvent"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);
    try {
      await expect(
        sessions.updateSummary(
          fixture.campaignInstanceId,
          concluded.id,
          fixture.ownerUserId,
          {
            expectedSessionRevision: concluded.metadataRevision,
            narrative: "This approval must roll back.",
          },
        ),
      ).rejects.toThrow("forced late Session outbox failure");
      const [storedSession, summary, outboxCount] = await Promise.all([
        prisma.campaignInstanceSession.findUniqueOrThrow({
          where: { id: concluded.id },
        }),
        prisma.campaignSessionSummary.findUniqueOrThrow({
          where: {
            sessionId_revision: { sessionId: concluded.id, revision: 1 },
          },
        }),
        prisma.campaignSessionOutboxEvent.count({
          where: { sessionId: concluded.id },
        }),
      ]);
      expect(storedSession.metadataRevision).toBe(concluded.metadataRevision);
      expect(storedSession.summaryStatus).toBe("DRAFT");
      expect(summary).toMatchObject({ status: "DRAFT", narrative: "" });
      expect(outboxCount).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "CampaignSessionOutboxEvent"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS "${functionName}"()`,
      );
    }

    const approved = await sessions.updateSummary(
      fixture.campaignInstanceId,
      concluded.id,
      fixture.ownerUserId,
      {
        expectedSessionRevision: concluded.metadataRevision,
        narrative: "Approved summary",
      },
    );
    const approvedSession =
      await prisma.campaignInstanceSession.findUniqueOrThrow({
        where: { id: concluded.id },
        select: { metadataRevision: true },
      });
    const amended = await sessions.updateSummary(
      fixture.campaignInstanceId,
      concluded.id,
      fixture.ownerUserId,
      {
        expectedSessionRevision: approvedSession.metadataRevision,
        narrative: "Amended summary",
      },
    );
    expect(amended.eventSequenceThrough).toBe(approved.eventSequenceThrough);
    await expect(
      prisma.campaignSessionSummary.update({
        where: { sessionId_revision: { sessionId: concluded.id, revision: 1 } },
        data: { narrative: "Mutation must fail" },
      }),
    ).rejects.toThrow("Approved Campaign Session summaries are immutable");
  }, 40_000);
});

async function createAndConcludeSession(
  sessions: CampaignSessionService,
  fixture: Fixture,
  name: string,
) {
  const planned = await sessions.create(
    fixture.campaignInstanceId,
    fixture.ownerUserId,
    { idempotencyKey: `${name}-${randomUUID()}`, name },
  );
  const lobby = await sessions.command(
    fixture.campaignInstanceId,
    planned.id,
    fixture.ownerUserId,
    "open-lobby",
    { expectedMetadataRevision: planned.metadataRevision },
  );
  await sessions.join(
    fixture.campaignInstanceId,
    planned.id,
    fixture.ownerUserId,
    `presence-${randomUUID()}`,
  );
  const readiness = await sessions.readiness(
    fixture.campaignInstanceId,
    planned.id,
    fixture.ownerUserId,
  );
  const active = await sessions.command(
    fixture.campaignInstanceId,
    planned.id,
    fixture.ownerUserId,
    "start",
    {
      expectedMetadataRevision: lobby.metadataRevision,
      expectedRuntimeRevision: readiness.runtimeRevision,
      readinessToken: readiness.token,
    },
  );
  return sessions.command(
    fixture.campaignInstanceId,
    planned.id,
    fixture.ownerUserId,
    "conclude",
    { expectedMetadataRevision: active.metadataRevision },
  );
}

async function seedFixture(prisma: PrismaClient): Promise<Fixture> {
  const prefix = `postgres-${randomUUID()}`;
  const id = (name: string) => `${prefix}-${name}`;
  const ownerUserId = id("owner");
  const worldDefinitionId = id("world");
  const worldRevision1Id = id("world-revision-1");
  const worldRevision2Id = id("world-revision-2");
  const worldSnapshot1Id = id("world-snapshot-1");
  const worldSnapshot2Id = id("world-snapshot-2");
  const campaignDefinitionId = id("campaign");
  const campaignRevision1Id = id("campaign-revision-1");
  const campaignRevision2Id = id("campaign-revision-2");
  const campaignSnapshot1Id = id("campaign-snapshot-1");
  const campaignSnapshot2Id = id("campaign-snapshot-2");
  const campaignInstanceId = id("instance");
  const sourceSnapshotId = id("instance-snapshot-1");
  const runtimeId = id("runtime");
  const sessionId = id("session");
  const worldManifest1 = revisionManifest(
    "world-definition-revision",
    worldRevision1Id,
    1,
  );
  const worldManifest2 = revisionManifest(
    "world-definition-revision",
    worldRevision2Id,
    2,
  );
  const campaignManifest1 = revisionManifest(
    "campaign-definition-revision",
    campaignRevision1Id,
    1,
  );
  const campaignManifest2 = revisionManifest(
    "campaign-definition-revision",
    campaignRevision2Id,
    2,
  );

  await prisma.user.create({
    data: { id: ownerUserId, displayName: "PostgreSQL verifier", role: "GM" },
  });
  await prisma.worldDefinition.create({
    data: {
      id: worldDefinitionId,
      name: "PostgreSQL verification world",
      ownerUserId,
    },
  });
  await prisma.worldDefinitionRevision.createMany({
    data: [
      {
        id: worldRevision1Id,
        worldDefinitionId,
        revisionNumber: 1,
        name: "World revision one",
        content: {},
        contentHash: firstRecordContentHash(worldManifest1),
        createdByUserId: ownerUserId,
      },
      {
        id: worldRevision2Id,
        worldDefinitionId,
        revisionNumber: 2,
        predecessorRevisionId: worldRevision1Id,
        name: "World revision two",
        content: {},
        contentHash: firstRecordContentHash(worldManifest2),
        createdByUserId: ownerUserId,
      },
    ],
  });
  await prisma.worldDefinitionSnapshot.createMany({
    data: [
      {
        id: worldSnapshot1Id,
        worldDefinitionId,
        worldDefinitionRevisionId: worldRevision1Id,
        manifest: worldManifest1 as unknown as Prisma.InputJsonValue,
        contentHash: worldManifest1.contentHash,
      },
      {
        id: worldSnapshot2Id,
        worldDefinitionId,
        worldDefinitionRevisionId: worldRevision2Id,
        manifest: worldManifest2 as unknown as Prisma.InputJsonValue,
        contentHash: worldManifest2.contentHash,
      },
    ],
  });
  await prisma.campaignDefinition.create({
    data: {
      id: campaignDefinitionId,
      worldDefinitionId,
      name: "PostgreSQL verification campaign",
      ownerUserId,
    },
  });
  await prisma.campaignDefinitionRevision.createMany({
    data: [
      {
        id: campaignRevision1Id,
        campaignDefinitionId,
        worldDefinitionId,
        capturedWorldSnapshotId: worldSnapshot1Id,
        revisionNumber: 1,
        name: "Campaign revision one",
        content: {},
        contentHash: firstRecordContentHash(campaignManifest1),
        createdByUserId: ownerUserId,
      },
      {
        id: campaignRevision2Id,
        campaignDefinitionId,
        worldDefinitionId,
        capturedWorldSnapshotId: worldSnapshot2Id,
        revisionNumber: 2,
        predecessorRevisionId: campaignRevision1Id,
        name: "Campaign revision two",
        content: {},
        contentHash: firstRecordContentHash(campaignManifest2),
        createdByUserId: ownerUserId,
      },
    ],
  });
  await prisma.campaignDefinitionSnapshot.createMany({
    data: [
      {
        id: campaignSnapshot1Id,
        campaignDefinitionId,
        campaignDefinitionRevisionId: campaignRevision1Id,
        capturedWorldSnapshotId: worldSnapshot1Id,
        manifest: campaignManifest1 as unknown as Prisma.InputJsonValue,
        contentHash: campaignManifest1.contentHash,
      },
      {
        id: campaignSnapshot2Id,
        campaignDefinitionId,
        campaignDefinitionRevisionId: campaignRevision2Id,
        capturedWorldSnapshotId: worldSnapshot2Id,
        manifest: campaignManifest2 as unknown as Prisma.InputJsonValue,
        contentHash: campaignManifest2.contentHash,
      },
    ],
  });
  await prisma.campaignInstance.create({
    data: {
      id: campaignInstanceId,
      campaignDefinitionId,
      name: "PostgreSQL verification instance",
      status: "ACTIVE",
      ownerUserId,
      createdByUserId: ownerUserId,
    },
  });
  await prisma.campaignInstanceHumanMembership.create({
    data: {
      campaignInstanceId,
      userId: ownerUserId,
      displayName: "PostgreSQL verifier",
      role: "GM",
    },
  });
  await prisma.campaignInstanceSnapshot.create({
    data: {
      id: sourceSnapshotId,
      campaignInstanceId,
      campaignDefinitionId,
      campaignDefinitionSnapshotId: campaignSnapshot1Id,
      worldDefinitionSnapshotId: worldSnapshot1Id,
      snapshotNumber: 1,
      reason: "INITIAL",
      manifest: campaignManifest1 as unknown as Prisma.InputJsonValue,
      contentHash: campaignManifest1.contentHash,
      createdByUserId: ownerUserId,
    },
  });
  await prisma.campaignInstance.update({
    where: { id: campaignInstanceId },
    data: { currentSnapshotId: sourceSnapshotId },
  });
  await prisma.campaignInstanceRuntime.create({
    data: {
      id: runtimeId,
      campaignInstanceId,
      campaignInstanceSnapshotId: sourceSnapshotId,
      state: emptyRuntime(),
    },
  });
  await prisma.campaignInstanceSession.create({
    data: {
      id: sessionId,
      campaignInstanceId,
      name: "PostgreSQL verification Session",
    },
  });
  return {
    ownerUserId,
    campaignInstanceId,
    sourceSnapshotId,
    targetCampaignDefinitionSnapshotId: campaignSnapshot2Id,
    runtimeId,
    sessionId,
  };
}

async function migrationRequest(
  service: CampaignInstanceMigrationsService,
  fixture: Fixture,
) {
  const request = {
    sourceSnapshotId: fixture.sourceSnapshotId,
    targetCampaignDefinitionSnapshotId:
      fixture.targetCampaignDefinitionSnapshotId,
    expectedRuntimeRevision: 1,
    mappings: [],
  };
  const preview = await service.preview(
    fixture.campaignInstanceId,
    fixture.ownerUserId,
    request as never,
  );
  expect(preview.ready).toBe(true);
  return { ...request, planHash: preview.planHash } as never;
}

async function expectUnchanged(prisma: PrismaClient, fixture: Fixture) {
  const [instance, runtime, snapshots, checkpoints, migrations, audits] =
    await Promise.all([
      prisma.campaignInstance.findUniqueOrThrow({
        where: { id: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceRuntime.findUniqueOrThrow({
        where: { id: fixture.runtimeId },
      }),
      prisma.campaignInstanceSnapshot.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceRuntimeCheckpoint.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceMigrationAudit.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceAuditEvent.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
    ]);
  expect(instance.currentSnapshotId).toBe(fixture.sourceSnapshotId);
  expect(instance.metadataRevision).toBe(1);
  expect(runtime.campaignInstanceSnapshotId).toBe(fixture.sourceSnapshotId);
  expect(runtime.revision).toBe(1);
  expect(snapshots).toBe(1);
  expect(checkpoints).toBe(0);
  expect(migrations).toBe(0);
  expect(audits).toBe(0);
}

async function expectMigrated(prisma: PrismaClient, fixture: Fixture) {
  const [instance, runtime, snapshots, checkpoints, migrations, audits] =
    await Promise.all([
      prisma.campaignInstance.findUniqueOrThrow({
        where: { id: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceRuntime.findUniqueOrThrow({
        where: { id: fixture.runtimeId },
      }),
      prisma.campaignInstanceSnapshot.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceRuntimeCheckpoint.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceMigrationAudit.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
      prisma.campaignInstanceAuditEvent.count({
        where: { campaignInstanceId: fixture.campaignInstanceId },
      }),
    ]);
  expect(instance.currentSnapshotId).not.toBe(fixture.sourceSnapshotId);
  expect(instance.metadataRevision).toBe(2);
  expect(runtime.campaignInstanceSnapshotId).toBe(instance.currentSnapshotId);
  expect(runtime.revision).toBe(2);
  expect(snapshots).toBe(2);
  expect(checkpoints).toBe(2);
  expect(migrations).toBe(1);
  expect(audits).toBe(1);
}

async function pauseSession(prisma: PrismaClient, sessionId: string) {
  await prisma.campaignInstanceSession.update({
    where: { id: sessionId },
    data: { status: "CONCLUDED", concludedAt: new Date() },
  });
}

function revisionManifest(
  resourceType: "campaign-definition-revision" | "world-definition-revision",
  sourceId: string,
  sourceRevision: number,
) {
  return buildSnapshotManifest(1, [
    {
      resourceType,
      sourceId,
      sourceRevision,
      payload: { name: `${resourceType} ${sourceRevision}` },
    },
  ]);
}

function emptyRuntime() {
  return {
    formatVersion: 1,
    preparation: { extensions: {} },
    plotProgress: [],
    placementRealizations: [],
    creatureEmbodiments: [],
    itemInstances: [],
  };
}

function firstRecordContentHash(
  manifest: ReturnType<typeof buildSnapshotManifest>,
) {
  const record = manifest.records.at(0);
  if (!record) throw new Error("Revision fixture manifest is empty.");
  return record.contentHash;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCheckpointAdvisoryWait(prisma: PrismaClient) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await prisma.$queryRaw<readonly { waiting: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
          AND query LIKE '%CampaignInstanceRuntimeCheckpoint%'
      ) AS waiting
    `;
    if (rows[0]?.waiting) return;
    await delay(25);
  }
  throw new Error("Migration did not reach the checkpoint advisory gate.");
}

function assertDisposableDatabase(value: string) {
  const databaseName = new URL(value).pathname.slice(1);
  if (!/(test|verify|disposable)/i.test(databaseName)) {
    throw new Error(
      "CAMPAIGN_INSTANCE_TEST_DATABASE_URL must name an explicit test, verify, or disposable database.",
    );
  }
}

function playerProfileContactPreflightSql() {
  return migrationBlockSql("player_profile_contact_preflight");
}

function migrationBlockSql(delimiter: string) {
  const migration = readFileSync(
    join(
      __dirname,
      "../../prisma/migrations/20260908000000_campaign_session_vertical_slice/migration.sql",
    ),
    "utf8",
  );
  const marker = `$${delimiter}$`;
  const start = migration.indexOf(`DO ${marker}`);
  const end = migration.indexOf(`${marker};`, start);
  const preflight =
    start >= 0 && end >= 0
      ? migration.slice(start, end + marker.length + 1)
      : undefined;
  if (!preflight) throw new Error(`${delimiter} SQL is unavailable.`);
  return preflight;
}
