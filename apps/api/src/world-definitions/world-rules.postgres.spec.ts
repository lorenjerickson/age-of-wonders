import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CoreModelRegistryBootstrapService } from "../model-registry/core-model-registry-bootstrap.service";
import { ModelRegistryService } from "../model-registry/model-registry.service";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { WorldRulesService } from "./world-rules.service";
import { CampaignDefinitionsService } from "../campaign-definitions/campaign-definitions.service";
import { CampaignInstancesService } from "../campaign-instances/campaign-instances.service";
import { CampaignInstanceMigrationsService } from "../campaign-instances/campaign-instance-migrations.service";
import { isCanonicalSnapshotManifest } from "../domain/snapshot-manifest";

const databaseUrl = process.env.MOVEMENT_TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;
function rulesIn(manifest: unknown) {
  if (!isCanonicalSnapshotManifest(manifest))
    throw new Error("Expected a canonical captured manifest.");
  return manifest.records.filter(
    (record) => record.resourceType === "world-rules",
  );
}

postgres(
  "World rules publication and downstream migration in PostgreSQL",
  () => {
    let prisma: PrismaClient;
    beforeAll(async () => {
      if (
        !databaseUrl ||
        !/(test|verify|disposable)/i.test(new URL(databaseUrl).pathname)
      )
        throw new Error(
          "MOVEMENT_TEST_DATABASE_URL must point to an explicit disposable verification database.",
        );
      prisma = new PrismaClient({ datasourceUrl: databaseUrl });
      await prisma.$connect();
      await new CoreModelRegistryBootstrapService(
        prisma as never,
      ).onModuleInit();
    }, 60_000);
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("saves and publishes exact rules while existing Instances remain inert until explicit captured migration", async () => {
      const owner = await prisma.user.create({
        data: { displayName: "Rule publication verifier", role: "GM" },
      });
      const models = new ModelRegistryService(prisma as never);
      const worlds = new WorldDefinitionAuthoringService(
        prisma as never,
        models,
      );
      const rules = new WorldRulesService(worlds);
      const campaigns = new CampaignDefinitionsService(prisma as never, models);
      const instances = new CampaignInstancesService(prisma as never);
      const migrations = new CampaignInstanceMigrationsService(prisma as never);
      const createdWorld = (await worlds.create(
        { name: `Rules verification ${randomUUID()}` },
        owner.id,
      ));
      const worldId = createdWorld.id;
      const initialWorldDraft = await worlds.getActiveDraft(worldId, owner.id);
      expect(
        (
          await worlds.validate(
            worldId,
            { expectedStorageRevision: initialWorldDraft.storageRevision },
            owner.id,
          )
        ).valid,
      ).toBe(true);
      const firstWorld = (await worlds.publish(
        worldId,
        { expectedStorageRevision: initialWorldDraft.storageRevision },
        owner.id,
      ));
      const firstWorldSnapshotId = firstWorld.snapshot!.id;
      const createdCampaign = (await campaigns.create(
        {
          name: "Captured rule verification",
          worldDefinitionSnapshotId: firstWorldSnapshotId,
        },
        owner.id,
      ));
      expect(
        (
          await campaigns.validate(
            createdCampaign.id,
            { expectedStorageRevision: createdCampaign.draft.storageRevision },
            owner.id,
          )
        ).valid,
      ).toBe(true);
      const firstCampaign = (await campaigns.publish(
        createdCampaign.id,
        { expectedStorageRevision: createdCampaign.draft.storageRevision },
        owner.id,
      ));
      const instance = await instances.create(
        {
          name: "Rule-free group",
          campaignDefinitionSnapshotId: firstCampaign.snapshot.id,
          idempotencyKey: randomUUID(),
        },
        owner.id,
        owner.displayName,
        createdCampaign.id,
      );
      const instanceId = instance.id;
      if (typeof instanceId !== "string")
        throw new Error("Expected a created Instance identity.");
      const currentInstance = () =>
        prisma.campaignInstance.findUniqueOrThrow({
          where: { id: instanceId },
          include: {
            runtime: true,
            currentSnapshot: { include: { worldDefinitionSnapshot: true } },
          },
        });
      const initialInstance = await currentInstance();
      expect(
        rulesIn(
          initialInstance.currentSnapshot!.worldDefinitionSnapshot.manifest,
        ),
      ).toEqual([]);
      expect(initialInstance.status).toBe("PREPARING");
      const unchangedRuntime = initialInstance.runtime!.state;

      const draft = await worlds.getActiveDraft(worldId, owner.id);
      const adopted = await rules.starter(
        worldId,
        owner.id,
        {
          expectedDraftId: draft.id,
          expectedStorageRevision: draft.storageRevision,
        },
        35,
      );
      expect(adopted.rules).toHaveLength(6);
      await expect(
        rules.starter(
          worldId,
          owner.id,
          {
            expectedDraftId: draft.id,
            expectedStorageRevision: draft.storageRevision,
          },
          35,
        ),
      ).rejects.toThrow("draft changed");
      const authoredDraft = await worlds.getActiveDraft(worldId, owner.id);
      await expect(
        worlds.save(
          worldId,
          {
            expectedDraftId: authoredDraft.id,
            expectedStorageRevision: authoredDraft.storageRevision,
            revisionName: authoredDraft.revisionName,
            content: authoredDraft.content as Record<string, unknown>,
            records: authoredDraft.records.filter(
              (record) => record.resourceType !== "world-rules",
            ),
          },
          owner.id,
        ),
      ).rejects.toThrow("World Rules");
      // Publication must reject a changed draft until that exact revision passes validation.
      await expect(
        worlds.publish(
          worldId,
          { expectedStorageRevision: adopted.storageRevision },
          owner.id,
        ),
      ).rejects.toThrow("Validate this exact World draft");
      expect(
        (
          await worlds.validate(
            worldId,
            { expectedStorageRevision: adopted.storageRevision },
            owner.id,
          )
        ).valid,
      ).toBe(true);
      const secondWorld = (await worlds.publish(
        worldId,
        { expectedStorageRevision: adopted.storageRevision },
        owner.id,
      ));
      const secondSnapshot =
        await prisma.worldDefinitionSnapshot.findUniqueOrThrow({
          where: { id: secondWorld.snapshot!.id },
        });
      expect(
        rulesIn(secondSnapshot.manifest).map((record) => record.payload),
      ).toEqual(expect.arrayContaining(adopted.rules));
      expect(rulesIn(secondSnapshot.manifest)).toHaveLength(6);
      for (const record of rulesIn(secondSnapshot.manifest)) {
        expect(record.payload).toMatchObject({
          id: record.sourceId,
          revision: record.sourceRevision,
        });
      }
      expect(
        rulesIn(
          (await currentInstance()).currentSnapshot!.worldDefinitionSnapshot
            .manifest,
        ),
      ).toEqual([]);
      expect((await currentInstance()).runtime!.state).toEqual(
        unchangedRuntime,
      );

      const campaignDraft = await campaigns.getDraft(
        createdCampaign.id,
        owner.id,
      );
      const campaignRequest = {
        expectedStorageRevision: campaignDraft.storageRevision,
        targetWorldDefinitionSnapshotId: secondSnapshot.id,
        mappings: [],
      };
      const campaignPlan = await campaigns.previewWorldMigration(
        createdCampaign.id,
        campaignRequest,
        owner.id,
      );
      expect(campaignPlan.ready).toBe(true);
      const secondCampaign = (await campaigns.applyWorldMigration(
        createdCampaign.id,
        { ...campaignRequest, expectedPlanHash: campaignPlan.planHash },
        owner.id,
      ));
      expect(
        rulesIn(
          (await currentInstance()).currentSnapshot!.worldDefinitionSnapshot
            .manifest,
        ),
      ).toEqual([]);
      const request = {
        sourceSnapshotId: initialInstance.currentSnapshotId!,
        targetCampaignDefinitionSnapshotId: secondCampaign.snapshot.id,
        expectedRuntimeRevision: initialInstance.runtime!.revision,
        mappings: [],
      };
      const plan = await migrations.preview(
        instanceId,
        owner.id,
        request as never,
      );
      expect(plan.ready).toBe(true);
      const applied = await migrations.apply(instanceId, owner.id, {
        ...request,
        planHash: plan.planHash,
      } as never);
      const migrated = await currentInstance();
      expect(migrated.currentSnapshotId).toBe(applied.snapshot.snapshotId);
      expect(
        rulesIn(migrated.currentSnapshot!.worldDefinitionSnapshot.manifest).map(
          (record) => record.payload,
        ),
      ).toEqual(expect.arrayContaining(adopted.rules));
      expect(migrated.runtime!.revision).toBe(
        initialInstance.runtime!.revision + 1,
      );
      expect(migrated.runtime!.state).toEqual(unchangedRuntime);
      // Both the original capture and the new capture survive subsequent authoring edits unchanged.
      const capturedBeforeEdit = secondSnapshot.manifest;
      const editDraft = await worlds.getActiveDraft(worldId, owner.id);
      await rules.upsert(
        worldId,
        owner.id,
        {
          expectedDraftId: editDraft.id,
          expectedStorageRevision: editDraft.storageRevision,
        },
        { ...adopted.rules[0], lifecycle: "disabled" },
        adopted.rules[0].id,
      );
      expect(
        (
          await prisma.worldDefinitionSnapshot.findUniqueOrThrow({
            where: { id: secondSnapshot.id },
          })
        ).manifest,
      ).toEqual(capturedBeforeEdit);
      expect(
        rulesIn(
          (
            await prisma.worldDefinitionSnapshot.findUniqueOrThrow({
              where: { id: firstWorldSnapshotId },
            })
          ).manifest,
        ),
      ).toEqual([]);
      expect(
        rulesIn(
          (await currentInstance()).currentSnapshot!.worldDefinitionSnapshot
            .manifest,
        ).map((record) => record.payload),
      ).toEqual(expect.arrayContaining(adopted.rules));
    }, 60_000);
  },
);
