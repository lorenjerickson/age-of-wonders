import { randomUUID } from "node:crypto";
import { CORE_ATTRIBUTE_KEYS } from "@aow/common";
import { ConflictException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { CampaignInstanceCharacterDraftsService } from "./campaign-instance-character-drafts.service";
import { CampaignInstanceCharactersService } from "./campaign-instance-characters.service";

const databaseUrl = process.env.EQUIPMENT_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("Character lifecycle PostgreSQL boundary", () => {
  let db: PrismaClient;
  let drafts: CampaignInstanceCharacterDraftsService;
  let characters: CampaignInstanceCharactersService;
  beforeAll(async () => {
    if (
      !databaseUrl ||
      !/^\/aow_b08_disposable_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname)
    )
      throw new Error("Use the dedicated B08 disposable database.");
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    await db.$connect();
    drafts = new CampaignInstanceCharacterDraftsService(db as never);
    characters = new CampaignInstanceCharactersService(db as never, drafts);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function importedAndApproved() {
    const f = await seed(db);
    const result = await characters.importCharacter(f.instance, f.owner, {
      playerMembershipId: f.destinationMembership,
      sourceCampaignDefinitionId: f.campaign,
      sourceCampaignInstanceId: f.sourceInstance,
      sourceCharacterId: f.sourceCharacter,
      name: "Imported wanderer",
    });
    const characterId = result.character.characterId;
    // Seed a complete submitted sheet; external artwork generation and rolling UI are not under test.
    await db.campaignInstanceCharacterDraft.update({
      where: { characterId },
      data: {
        status: "READY_FOR_REVIEW",
        submittedAt: new Date(),
        attributeRolls: f.rolls,
      },
    });
    await drafts.review(f.instance, characterId, f.owner, {
      expectedRevision: 1,
      decision: "approve",
    });
    return { ...f, characterId };
  }

  it("roundtrips imported sourceSheet and acquired rolls through real approval and activation transactions", async () => {
    const f = await importedAndApproved();
    const before = await db.campaignInstanceCharacterDraft.findUniqueOrThrow({
      where: { characterId: f.characterId },
    });
    expect(before.sourceSheet).toEqual(f.sourceSheet);
    await characters.changeCharacterStatus(f.instance, f.characterId, f.owner, {
      expectedStatus: "draft",
      targetStatus: "active",
    });
    const record = await db.domainRecord.findUniqueOrThrow({
      where: { resource_id: { resource: "characters", id: f.characterId } },
    });
    expect(record.data).toMatchObject({
      name: "Imported wanderer",
      identity: { id: f.characterId },
      campaignInstanceId: f.instance,
      ownerMembershipId: f.destinationMembership,
      privateData: { note: "survives transfer" },
      modifierGrants: [f.grant],
      sourceDraftRevision: before.revision,
    });
    expect(record.data).not.toHaveProperty("sourceSheet");
    const after = await db.campaignInstanceCharacterDraft.findUniqueOrThrow({
      where: { characterId: f.characterId },
    });
    expect(after.revision).toBe(before.revision + 1);
    expect(
      await db.campaignInstanceAuditEvent.count({
        where: {
          campaignInstanceId: f.instance,
          action: "instance.character.status-changed",
        },
      }),
    ).toBe(1);
  });

  it("rejects a stale approved revision without writing a sheet, status or activation audit", async () => {
    const f = await importedAndApproved();
    const real = drafts.activationMaterialization.bind(drafts);
    const intercept = jest
      .spyOn(drafts, "activationMaterialization")
      .mockImplementationOnce(async (...args) => {
        const materialization = await real(...args);
        // A competing persisted edit between materialization and the activation transaction.
        await db.campaignInstanceCharacterDraft.update({
          where: { characterId: f.characterId },
          data: { revision: { increment: 1 }, status: "IN_PROGRESS" },
        });
        return materialization;
      });
    try {
      await expect(
        characters.changeCharacterStatus(f.instance, f.characterId, f.owner, {
          expectedStatus: "draft",
          targetStatus: "active",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      intercept.mockRestore();
    }
    expect(
      await db.domainRecord.count({
        where: { resource: "characters", id: f.characterId },
      }),
    ).toBe(0);
    expect(
      (
        await db.campaignInstanceCharacterAssociation.findUniqueOrThrow({
          where: { characterId: f.characterId },
        })
      ).status,
    ).toBe("DRAFT");
    expect(
      await db.campaignInstanceAuditEvent.count({
        where: {
          campaignInstanceId: f.instance,
          action: "instance.character.status-changed",
        },
      }),
    ).toBe(0);
  });

  it("reactivates without overwriting runtime custom fields, grants or record revision", async () => {
    const f = await importedAndApproved();
    await characters.changeCharacterStatus(f.instance, f.characterId, f.owner, {
      expectedStatus: "draft",
      targetStatus: "active",
    });
    const key = { resource: "characters", id: f.characterId };
    const activated = await db.domainRecord.findUniqueOrThrow({
      where: { resource_id: key },
    });
    const data = {
      ...(activated.data as Prisma.JsonObject),
      customRuntime: { health: 3, private: "changed in play" },
      modifierGrants: [{ ...f.grant, active: false }],
    };
    await db.domainRecord.update({
      where: { resource_id: key },
      data: {
        data,
        revision: { increment: 1 },
      },
    });
    await characters.changeCharacterStatus(f.instance, f.characterId, f.owner, {
      expectedStatus: "active",
      targetStatus: "inactive",
    });
    const before = await db.domainRecord.findUniqueOrThrow({
      where: { resource_id: key },
    });
    await characters.changeCharacterStatus(f.instance, f.characterId, f.owner, {
      expectedStatus: "inactive",
      targetStatus: "active",
    });
    expect(
      await db.domainRecord.findUniqueOrThrow({ where: { resource_id: key } }),
    ).toEqual(before);
  });
});

async function seed(db: PrismaClient) {
  const owner = randomUUID(),
    player = randomUUID(),
    profile = randomUUID(),
    world = randomUUID(),
    wr = randomUUID(),
    ws = randomUUID(),
    campaign = randomUUID(),
    cr = randomUUID(),
    cs = randomUUID(),
    instance = randomUUID(),
    sourceInstance = randomUUID(),
    destinationMembership = randomUUID(),
    sourceMembership = randomUUID(),
    sourceCharacter = randomUUID();
  const recipe = {
    id: "health",
    label: "Hardy",
    kind: "rolled-flat",
    target: { kind: "health-maximum" },
    stacking: "add",
    dice: [{ count: 1, sides: 6 }],
  };
  const grant = {
    id: randomUUID(),
    grantedByEventId: "original-acquisition",
    active: true,
    source: { kind: "background", definitionId: "scout" },
    definition: recipe,
    resolution: { kind: "flat", rolls: [[4]], value: 4 },
  };
  const manifest = buildSnapshotManifest(1, [
    {
      resourceType: "definitions",
      sourceId: "scout",
      payload: {
        kind: "background",
        name: "Scout",
        components: { modifierGrants: [recipe] },
      },
    },
    {
      resourceType: "definitions",
      sourceId: "ranger",
      payload: { kind: "profession", name: "Ranger" },
    },
  ]);
  const campaignManifest = buildSnapshotManifest(1, [
    {
      resourceType: "campaign-definition-revision",
      sourceId: cr,
      payload: { name: "Lifecycle fixture" },
    },
  ]);
  await db.user.createMany({
    data: [
      { id: owner, displayName: "Lifecycle GM", role: "GM" },
      { id: player, displayName: "Lifecycle Player", role: "PARTICIPANT" },
    ],
  });
  await db.playerProfile.create({
    data: { id: profile, userId: player, displayName: "Lifecycle Player" },
  });
  await db.worldDefinition.create({
    data: { id: world, name: "Lifecycle World", ownerUserId: owner },
  });
  await db.worldDefinitionRevision.create({
    data: {
      id: wr,
      worldDefinitionId: world,
      revisionNumber: 1,
      name: "World",
      content: {},
      contentHash: manifest.contentHash,
    },
  });
  await db.worldDefinitionSnapshot.create({
    data: {
      id: ws,
      worldDefinitionId: world,
      worldDefinitionRevisionId: wr,
      manifest: manifest as unknown as Prisma.InputJsonValue,
      contentHash: manifest.contentHash,
    },
  });
  await db.campaignDefinition.create({
    data: {
      id: campaign,
      worldDefinitionId: world,
      name: "Lifecycle Campaign",
      ownerUserId: owner,
    },
  });
  await db.campaignDefinitionRevision.create({
    data: {
      id: cr,
      campaignDefinitionId: campaign,
      worldDefinitionId: world,
      capturedWorldSnapshotId: ws,
      revisionNumber: 1,
      name: "Campaign",
      content: {},
      contentHash: campaignManifest.contentHash,
    },
  });
  await db.campaignDefinitionSnapshot.create({
    data: {
      id: cs,
      campaignDefinitionId: campaign,
      campaignDefinitionRevisionId: cr,
      capturedWorldSnapshotId: ws,
      manifest: campaignManifest as unknown as Prisma.InputJsonValue,
      contentHash: campaignManifest.contentHash,
    },
  });
  for (const id of [instance, sourceInstance]) {
    const snapshot = randomUUID();
    await db.campaignInstance.create({
      data: {
        id,
        campaignDefinitionId: campaign,
        name: "Lifecycle Instance",
        ownerUserId: owner,
      },
    });
    await db.campaignInstanceSnapshot.create({
      data: {
        id: snapshot,
        campaignInstanceId: id,
        campaignDefinitionId: campaign,
        campaignDefinitionSnapshotId: cs,
        worldDefinitionSnapshotId: ws,
        snapshotNumber: 1,
        reason: "INITIAL",
        manifest: campaignManifest as unknown as Prisma.InputJsonValue,
        contentHash: campaignManifest.contentHash,
      },
    });
    await db.campaignInstance.update({
      where: { id },
      data: { currentSnapshotId: snapshot },
    });
    await db.campaignInstanceHumanMembership.create({
      data: {
        id: id === instance ? destinationMembership : sourceMembership,
        campaignInstanceId: id,
        userId: player,
        playerProfileId: profile,
        displayName: "Lifecycle Player",
        role: "PLAYER",
      },
    });
  }
  await db.campaignInstanceCharacterAssociation.create({
    data: {
      characterId: sourceCharacter,
      characterName: "Source wanderer",
      campaignInstanceId: sourceInstance,
      playerMembershipId: sourceMembership,
      status: "ACTIVE",
    },
  });
  const rolls = Array.from(
    { length: CORE_ATTRIBUTE_KEYS.length + 2 },
    (_, i) => i + 20,
  );
  const sourceSheet = {
    identity: { id: sourceCharacter, version: { revision: 1 } },
    campaignInstanceId: sourceInstance,
    ownerMembershipId: sourceMembership,
    name: "Source wanderer",
    backgroundDefinitionId: "scout",
    professionDefinitionId: "ranger",
    heritageDefinitionIds: [],
    attributeAssignments: Object.fromEntries(
      CORE_ATTRIBUTE_KEYS.map((key, i) => [key, rolls[i]]),
    ),
    startingEquipmentDefinitionIds: [],
    equipmentAssignments: {},
    imageAssetIds: {
      portrait: "portrait",
      overheadToken: "overhead",
      paperDollToken: "side",
    },
    biography: "Private biography",
    privateData: { note: "survives transfer" },
    modifierGrants: [grant],
  };
  await db.domainRecord.create({
    data: {
      resource: "characters",
      id: sourceCharacter,
      kind: "campaign-instance-character-sheet",
      name: "Source wanderer",
      data: sourceSheet,
    },
  });
  return {
    owner,
    campaign,
    instance,
    sourceInstance,
    destinationMembership,
    sourceCharacter,
    rolls,
    sourceSheet,
    grant,
  };
}
