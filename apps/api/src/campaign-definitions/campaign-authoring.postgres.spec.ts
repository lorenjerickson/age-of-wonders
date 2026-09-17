import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import { ModelRegistryService } from "../model-registry/model-registry.service";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
} from "../domain/snapshot-manifest";
import { CORE_MODEL_SCHEMA_RELEASE_ID } from "../model-registry/editable-core-model-seed";
import { CoreModelRegistryBootstrapService } from "../model-registry/core-model-registry-bootstrap.service";
const url = process.env.CAMPAIGN_AUTHORING_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "Campaign authoring PostgreSQL roundtrip",
  () => {
    let db: PrismaClient;
    beforeAll(async () => {
      if (!url || !/(test|verify|disposable)/i.test(new URL(url).pathname))
        throw new Error("Use an explicit disposable verification database");
      db = new PrismaClient({ datasourceUrl: url });
      await db.$connect();
      await new CoreModelRegistryBootstrapService(db as never).onModuleInit();
    }, 60_000);
    afterAll(async () => {
      await db?.$disconnect();
    });
    it("roundtrips placement/preparation, rejects stale saves, publishes, forks, migrates and archives", async () => {
      const owner = await db.user.create({
        data: { displayName: "Campaign workflow verifier", role: "GM" },
      });
      const world = await db.worldDefinition.create({
        data: { name: "Workflow captured World", ownerUserId: owner.id },
      });
      const locationId = randomUUID(),
        itemId = randomUUID();
      const creatureId = randomUUID(),
        worldPlacementId = randomUUID();
      const snapshots: string[] = [];
      let predecessor: string | undefined;
      for (const number of [1, 2]) {
        const content = {
          name: `World version ${number}`,
          modelSchemaReleaseIds: [CORE_MODEL_SCHEMA_RELEASE_ID],
        };
        const revision = await db.worldDefinitionRevision.create({
          data: {
            worldDefinitionId: world.id,
            revisionNumber: number,
            predecessorRevisionId: predecessor,
            name: content.name,
            content,
            contentHash: canonicalJsonHash(content),
            createdByUserId: owner.id,
          },
        });
        await db.worldDefinitionRevisionModelSchemaRelease.create({
          data: {
            worldDefinitionRevisionId: revision.id,
            modelSchemaReleaseId: CORE_MODEL_SCHEMA_RELEASE_ID,
            selectionOrder: 0,
          },
        });
        predecessor = revision.id;
        const manifest = buildSnapshotManifest(1, [
          {
            resourceType: "world-definition-revision",
            sourceId: revision.id,
            payload: content,
          },
          {
            resourceType: "locations",
            sourceId: locationId,
            payload: { id: locationId, name: "Harbor" },
          },
          {
            resourceType: "definitions",
            sourceId: itemId,
            payload: { id: itemId, name: "Floodgate Key", kind: "item" },
          },
          {
            resourceType: "definitions",
            sourceId: creatureId,
            payload: {
              id: creatureId,
              name: "Harbor Keeper",
              kind: "creature",
            },
          },
          {
            resourceType: "world-placements",
            sourceId: worldPlacementId,
            payload: {
              id: worldPlacementId,
              name: "Key at Harbor",
              worldDefinitionId: world.id,
              locationId,
              source: { kind: "world-item", itemDefinitionId: itemId },
            },
          },
        ]);
        const snapshot = await db.worldDefinitionSnapshot.create({
          data: {
            worldDefinitionId: world.id,
            worldDefinitionRevisionId: revision.id,
            manifest: manifest as unknown as Prisma.InputJsonValue,
            contentHash: manifest.contentHash,
          },
        });
        snapshots.push(snapshot.id);
      }
      const service = new CampaignDefinitionsService(
        db as never,
        new ModelRegistryService(db as never),
      );
      const campaign = await service.create(
        { name: "Harbor campaign", worldDefinitionSnapshotId: snapshots[0] },
        owner.id,
      );
      const placementId = randomUUID();
      const records = [
        {
          resourceType: "campaign-placements",
          sourceId: placementId,
          payload: {
            id: placementId,
            name: "Gate key",
            kind: "independent",
            locationId,
            plotDefinitionIds: [],
            source: { kind: "world-item", itemDefinitionId: itemId },
          },
        },
      ];
      const content = {
        ...(campaign.draft.content as Prisma.JsonObject),
        placementDefinitionIds: [placementId],
        preparation: {
          startingLocationId: locationId,
          startingContext: "At the harbor",
          mapVariations: "A storm approaches",
        },
      };
      const request = {
        expectedStorageRevision: campaign.draft.storageRevision,
        revisionName: "First harbor journey",
        content,
        records,
      };
      const saved = await service.save(campaign.id, request, owner.id);
      await expect(
        service.save(campaign.id, request, owner.id),
      ).rejects.toThrow();
      expect((await service.getDraft(campaign.id, owner.id)).content).toEqual(
        content,
      );
      expect(
        await service.validate(
          campaign.id,
          { expectedStorageRevision: saved.storageRevision },
          owner.id,
        ),
      ).toMatchObject({ valid: true, issues: [] });
      const published = await service.publish(
        campaign.id,
        { expectedStorageRevision: saved.storageRevision },
        owner.id,
      );
      const immutableBefore =
        await db.campaignDefinitionSnapshot.findUniqueOrThrow({
          where: { id: published.snapshot.id },
        });
      const fork = await service.fork(
        campaign.id,
        {
          sourceSnapshotId: published.snapshot.id,
          name: "Independent harbor fork",
        },
        owner.id,
      );
      expect(fork.draft.records[0].sourceId).not.toBe(placementId);
      expect((fork.draft.content as Prisma.JsonObject).preparation).toEqual(
        content.preparation,
      );
      expect(
        (
          await service.validate(
            fork.id,
            { expectedStorageRevision: fork.draft.storageRevision },
            owner.id,
          )
        ).valid,
      ).toBe(true);
      const draft = await service.getDraft(campaign.id, owner.id);
      const migrationRequest = {
        expectedStorageRevision: draft.storageRevision,
        targetWorldDefinitionSnapshotId: snapshots[1],
        mappings: [],
      };
      const plan = await service.previewWorldMigration(
        campaign.id,
        migrationRequest,
        owner.id,
      );
      const migrated = await service.applyWorldMigration(
        campaign.id,
        { ...migrationRequest, expectedPlanHash: plan.planHash },
        owner.id,
      );
      expect(migrated.snapshot.id).not.toBe(published.snapshot.id);
      expect(
        (
          (await service.getDraft(campaign.id, owner.id))
            .content as Prisma.JsonObject
        ).preparation,
      ).toEqual(content.preparation);
      expect(
        (
          await db.campaignDefinitionSnapshot.findUniqueOrThrow({
            where: { id: published.snapshot.id },
          })
        ).manifest,
      ).toEqual(immutableBefore.manifest);
      const detail = await service.get(fork.id, owner.id);
      await service.archive(
        fork.id,
        { expectedMetadataRevision: detail.metadataRevision },
        owner.id,
      );
      await expect(
        service.save(
          fork.id,
          { ...request, expectedStorageRevision: fork.draft.storageRevision },
          owner.id,
        ),
      ).rejects.toThrow();
      const archived = await service.get(fork.id, owner.id);
      await service.restore(
        fork.id,
        { expectedMetadataRevision: archived.metadataRevision },
        owner.id,
      );
      expect((await service.get(fork.id, owner.id)).status).toBe("active");
      // Optional isolated browser fixture handoff; never reassign a user's existing records.
      if (process.env.CAMPAIGN_BROWSER_FIXTURE_OWNER_SOURCE_ID) {
        const browserOwner = await db.campaignDefinition.findUniqueOrThrow({
          where: { id: process.env.CAMPAIGN_BROWSER_FIXTURE_OWNER_SOURCE_ID },
          select: { ownerUserId: true },
        });
        await db.worldDefinition.update({
          where: { id: world.id },
          data: { ownerUserId: browserOwner.ownerUserId },
        });
        await db.campaignDefinition.update({
          where: { id: campaign.id },
          data: { ownerUserId: browserOwner.ownerUserId },
        });
        console.log("BROWSER_PLACEMENT_FIXTURE", campaign.id);
      }
    }, 60_000);
    it("forks a large captured Campaign from the isolated clone", async () => {
      const source = await db.campaignDefinition.findFirst({
        where: { name: "The Darkness Within" },
        include: { currentRevision: { include: { snapshots: true } } },
      });
      if (!source?.ownerUserId || !source.currentRevision?.snapshots[0]) return;
      const transaction = db.$transaction.bind(db);
      const inspected = new Proxy(db, {
        get(target, key) {
          if (key !== "$transaction") return Reflect.get(target, key) as unknown;
          return (
            operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options: { isolationLevel: Prisma.TransactionIsolationLevel },
          ) =>
            transaction(async (tx) => {
              try {
                return await operation(tx);
              } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError)
                  console.error(
                    "Campaign fork transaction failure",
                    error.code,
                    error.meta,
                  );
                throw error;
              }
            }, options);
        },
      });
      const service = new CampaignDefinitionsService(
        inspected as never,
        new ModelRegistryService(db as never),
      );
      const fork = await service.fork(
        source.id,
        {
          sourceSnapshotId: source.currentRevision.snapshots[0].id,
          name: "Large captured fork verification",
        },
        source.ownerUserId,
      );
      expect(fork.id).not.toBe(source.id);
    }, 60_000);
  },
);
