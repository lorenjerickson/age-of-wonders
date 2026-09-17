// Persistence behavior is exercised against PostgreSQL; these tests isolate migration planning.
jest.mock("./terrain-exploration-checkpoints", () => ({
  checkpointExplorationSeal: jest.fn().mockResolvedValue({explorationHash: "empty", explorationCount: 0}),
  captureCheckpointExploration: jest.fn().mockResolvedValue(undefined),
  recoverCheckpointExploration: jest.fn().mockResolvedValue(undefined),
  restoreExplorationSource: jest.fn().mockResolvedValue({
    checkpoint: { id: "exploration-checkpoint", checkpointNumber: 1, explorationHash: null, explorationCount: null },
    rows: [], recorded: false,
  }),
}));
import { BadRequestException } from "@nestjs/common";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import {
  CampaignInstanceMigrationsService,
  capturedClosure,
  initializeAddedPlotProgress,
  rewriteRuntimeReferences,
  scopedMigrationReference,
  validateTargetRuntime,
} from "./campaign-instance-migrations.service";

function revisionManifest(
  resourceType: "campaign-definition-revision" | "world-definition-revision",
  id: string,
  revision: number,
  records: Array<{ resourceType: string; sourceId: string; payload: unknown }> = [],
) {
  return buildSnapshotManifest(1, [
    { resourceType, sourceId: id, sourceRevision: revision, payload: { name: id } },
    ...records.map((record) => ({ ...record, sourceRevision: revision })),
  ]);
}

function fixture(activeSession: { name: string } | null = null) {
  const sourceCampaign = revisionManifest(
    "campaign-definition-revision",
    "campaign-revision-1",
    1,
  );
  const targetCampaign = revisionManifest(
    "campaign-definition-revision",
    "campaign-revision-2",
    2,
  );
  const sourceWorld = revisionManifest(
    "world-definition-revision",
    "world-revision-1",
    1,
    [{ resourceType: "locations", sourceId: "old-location", payload: { name: "Old Harbor" } }],
  );
  const targetWorld = revisionManifest(
    "world-definition-revision",
    "world-revision-2",
    2,
    [{ resourceType: "locations", sourceId: "new-location", payload: { name: "New Harbor" } }],
  );
  const runtimeState: {
    formatVersion: number;
    preparation: Record<string, unknown>;
    plotProgress: unknown[];
    placementRealizations: unknown[];
    creatureEmbodiments: unknown[];
    itemInstances: unknown[];
  } = {
    formatVersion: 1,
    preparation: {
      startingLocationId: "old-location",
      extensions: { "test:note": "old-location" },
    },
    plotProgress: [],
    placementRealizations: [],
    creatureEmbodiments: [],
    itemInstances: [],
  };
  const instance = {
    id: "instance-1",
    name: "Tuesday Glasswake",
    status: "PREPARING",
    campaignDefinitionId: "campaign-definition-1",
    currentSnapshotId: "instance-snapshot-1",
    currentSnapshot: {
      id: "instance-snapshot-1",
      snapshotNumber: 1,
      reason: "INITIAL",
      adoptedAt: new Date("2026-09-01T00:00:00.000Z"),
      predecessorSnapshotId: null,
      campaignDefinitionSnapshotId: "campaign-snapshot-1",
      campaignDefinitionSnapshot: {
        manifest: sourceCampaign,
        campaignDefinitionRevision: {
          id: "campaign-revision-1",
          name: "First Campaign",
          revisionNumber: 1,
          campaignDefinitionId: "campaign-definition-1",
        },
      },
      worldDefinitionSnapshot: {
        manifest: sourceWorld,
        worldDefinitionRevision: {
          id: "world-revision-1",
          name: "First World",
          revisionNumber: 1,
          worldDefinitionId: "world-definition-1",
        },
      },
    },
    runtime: { revision: 3, state: runtimeState },
  };
  const target = {
    id: "campaign-snapshot-2",
    campaignDefinitionId: "campaign-definition-1",
    capturedWorldSnapshotId: "world-snapshot-2",
    manifest: targetCampaign,
    contentHash: targetCampaign.contentHash,
    capturedAt: new Date("2026-09-02T00:00:00.000Z"),
    campaignDefinitionRevision: {
      id: "campaign-revision-2",
      campaignDefinitionId: "campaign-definition-1",
      predecessorRevisionId: "campaign-revision-1",
      name: "Second Campaign",
      revisionNumber: 2,
      contentHash: targetCampaign.records[0].contentHash,
      publishedAt: new Date("2026-09-02T00:00:00.000Z"),
    },
    capturedWorldSnapshot: {
      id: "world-snapshot-2",
      manifest: targetWorld,
      contentHash: targetWorld.contentHash,
      capturedAt: new Date("2026-09-02T00:00:00.000Z"),
      worldDefinitionRevision: {
        id: "world-revision-2",
        worldDefinitionId: "world-definition-1",
        name: "Second World",
        revisionNumber: 2,
        contentHash: targetWorld.records[0].contentHash,
        publishedAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    },
  };
  const prisma = {
    campaignInstance: { findFirst: jest.fn().mockResolvedValue(instance) },
    campaignDefinitionSnapshot: { findFirst: jest.fn().mockResolvedValue(target) },
    campaignInstanceSession: { findFirst: jest.fn().mockResolvedValue(activeSession) },
    campaignInstanceCharacterAssociation: { findMany: jest.fn().mockResolvedValue([]) },
    campaignInstanceSnapshot: { findFirst: jest.fn() },
  };
  return { prisma, instance, target, runtimeState };
}

describe("CampaignInstanceMigrationsService", () => {
  it("rewrites every captured canonical runtime reference without changing local IDs or prose", () => {
    const campaign = revisionManifest("campaign-definition-revision", "campaign-revision-1", 1, [
      { resourceType: "plots", sourceId: "old-plot", payload: { name: "Plot" } },
      { resourceType: "campaign-placements", sourceId: "old-campaign-placement", payload: { name: "Placement" } },
      { resourceType: "model-schema-releases", sourceId: "old-release", payload: { name: "Schema" } },
      { resourceType: "model-elements", sourceId: "old-concept", payload: { payload: { kind: "concept" } } },
      { resourceType: "model-elements", sourceId: "old-field", payload: { payload: { kind: "field", storageKey: "test:definition", valueType: { kind: "definition-reference" } } } },
    ]);
    const world = revisionManifest("world-definition-revision", "world-revision-1", 1, [
      { resourceType: "locations", sourceId: "old-location", payload: { name: "Harbor" } },
      { resourceType: "definitions", sourceId: "old-creature", payload: { kind: "creature", name: "Warden" } },
      { resourceType: "definitions", sourceId: "old-item", payload: { kind: "item", name: "Lantern" } },
      { resourceType: "world-placements", sourceId: "old-world-placement", payload: { name: "Warden post" } },
      { resourceType: "extension-schemas", sourceId: "schema-1", payload: { key: "test:linked", jsonSchema: { type: "object", properties: { home: { type: "string", "x-aow-reference-resource": "locations" } } } } },
    ]);
    const mappings = new Map([
      ["plots:old-plot", "new-plot"],
      ["locations:old-location", "new-location"],
      ["campaign-placements:old-campaign-placement", "new-campaign-placement"],
      ["world-placements:old-world-placement", "new-world-placement"],
      ["definitions:old-creature", "new-creature"],
      ["definitions:old-item", "new-item"],
      ["model-schema-releases:old-release", "new-release"],
      ["model-elements:old-concept", "new-concept"],
      [`plot-objectives:${scopedMigrationReference(["old-plot"], "old-objective")}`, "new-objective"],
      [`plot-claims:${scopedMigrationReference(["old-plot"], "old-claim")}`, "new-claim"],
      [`plot-location-contexts:${scopedMigrationReference(["old-plot"], "old-context")}`, "new-context"],
      [`plot-actor-intents:${scopedMigrationReference(["old-plot", "old-context"], "old-actor-intent")}`, "new-actor-intent"],
      [`plot-item-intents:${scopedMigrationReference(["old-plot", "old-context"], "old-item-intent")}`, "new-item-intent"],
    ]);
    const migrated = rewriteRuntimeReferences({
      formatVersion: 1,
      preparation: {
        startingLocationId: "old-location",
        startingContext: "Meet at old-location",
        locationCanvases: [{ locationId: "old-location", layers: [] }],
        conformance: { modelSchemaReleaseIds: ["old-release"], conceptId: "old-concept" },
        modelValues: { "test:definition": "old-item" },
        extensions: { "test:linked": { home: "old-location" }, "test:prose": "old-location" },
      },
      plotProgress: [{
        campaignInstanceId: "instance-1",
        plotDefinitionId: "old-plot",
        status: "not-started",
        objectiveProgress: [{ objectiveId: "old-objective", status: "not-started" }],
        revealedClaimIds: ["old-claim"],
        creatureKnowledge: [{ kind: "heard-rumor", creatureId: "runtime-entity", claimId: "old-claim" }],
        locationRealizations: [{ plotLocationContextId: "old-context", actors: [{ actorPlacementIntentId: "old-actor-intent", runtimeActorId: "runtime-entity", runtimePlacementId: "runtime-placement" }], items: [{ itemPlacementIntentId: "old-item-intent", runtimeItemId: "runtime-item", runtimePlacementId: "runtime-placement" }] }],
      }],
      placementRealizations: [{ identity: { id: "runtime-placement", version: { revision: 1, updatedAt: "2026-09-01T00:00:00.000Z" } }, name: "Post", campaignInstanceId: "instance-1", source: { kind: "campaign-placement", campaignPlacementDefinitionId: "old-campaign-placement", capturedWorldPlacementDefinitionId: "old-world-placement" }, sourceLocationId: "old-location", currentLocationId: "old-location", status: "realized", realizedEntity: { kind: "creature", runtimeCreatureId: "runtime-creature" } }],
      creatureEmbodiments: [{ campaignInstanceId: "instance-1", runtimeCreatureId: "runtime-creature", runtimeEntityId: "runtime-entity", source: { kind: "captured-world-creature", sourceCreatureId: "old-creature", embodimentPolicy: { policy: { strategy: "one-per-instance", maximumPerCampaignInstance: 1 }, source: "explicit" } }, creature: { identity: { id: "runtime-creature", version: { revision: 1, updatedAt: "2026-09-01T00:00:00.000Z" } }, entityId: "runtime-entity", name: "Warden", definitionId: "old-creature", currentLocationId: "old-location" } }],
      itemInstances: [{ id: "runtime-item", definitionId: "old-item", quantity: 1, quality: "standard", location: { kind: "location", locationId: "old-location" } }],
    }, mappings, capturedClosure(campaign, world)) as Record<string, unknown>;
    const preparation = migrated.preparation as Record<string, unknown>;
    expect(preparation).toMatchObject({ startingLocationId: "new-location", startingContext: "Meet at old-location", modelValues: { "test:definition": "new-item" }, extensions: { "test:linked": { home: "new-location" }, "test:prose": "old-location" } });
    expect((preparation.locationCanvases as Array<Record<string, unknown>>)[0]?.locationId).toBe("new-location");
    const progress = (migrated.plotProgress as Array<Record<string, unknown>>)[0];
    expect(progress.plotDefinitionId).toBe("new-plot");
    expect(progress).toMatchObject({
      objectiveProgress: [{ objectiveId: "new-objective" }],
      revealedClaimIds: ["new-claim"],
      creatureKnowledge: [{ creatureId: "runtime-entity", claimId: "new-claim" }],
      locationRealizations: [{
        plotLocationContextId: "new-context",
        actors: [{ actorPlacementIntentId: "new-actor-intent", runtimeActorId: "runtime-entity", runtimePlacementId: "runtime-placement" }],
        items: [{ itemPlacementIntentId: "new-item-intent", runtimeItemId: "runtime-item", runtimePlacementId: "runtime-placement" }],
      }],
    });
    const placement = (migrated.placementRealizations as Array<Record<string, unknown>>)[0];
    expect(placement).toMatchObject({ sourceLocationId: "new-location", currentLocationId: "new-location", source: { campaignPlacementDefinitionId: "new-campaign-placement", capturedWorldPlacementDefinitionId: "new-world-placement" } });
    const embodiment = (migrated.creatureEmbodiments as Array<Record<string, unknown>>)[0];
    expect(embodiment).toMatchObject({ source: { sourceCreatureId: "new-creature" }, creature: { definitionId: "new-creature", currentLocationId: "new-location" } });
    expect((migrated.itemInstances as Array<Record<string, unknown>>)[0]).toMatchObject({ definitionId: "new-item", location: { locationId: "new-location" } });
  });

  it("rejects target Plot, runtime-local, item, Creature, Model, and schema-bound reference failures", () => {
    const campaign = revisionManifest("campaign-definition-revision", "campaign-revision-2", 2, [
      { resourceType: "plots", sourceId: "plot-1", payload: { objectives: [{ id: "objective-1" }], discoveries: [{ claims: [{ id: "claim-1" }] }], locationContexts: [{ id: "context-1" }] } },
      { resourceType: "model-schema-releases", sourceId: "release-1", payload: { name: "Schema" } },
      { resourceType: "model-elements", sourceId: "concept-1", payload: { payload: { kind: "concept" } } },
      { resourceType: "model-elements", sourceId: "field-1", payload: { payload: { kind: "field", ownerConceptId: "concept-1", storageKey: "test:definition", valueType: { kind: "definition-reference" } } } },
    ]);
    const world = revisionManifest("world-definition-revision", "world-revision-2", 2, [
      { resourceType: "locations", sourceId: "location-1", payload: { name: "Harbor" } },
      { resourceType: "definitions", sourceId: "creature-1", payload: { kind: "creature", name: "Warden", instanceEmbodimentPolicy: { strategy: "one-per-instance", maximumPerCampaignInstance: 1 } } },
      { resourceType: "definitions", sourceId: "item-1", payload: { kind: "item", name: "Lantern" } },
      { resourceType: "extension-schemas", sourceId: "schema-1", payload: { key: "test:linked", jsonSchema: { "x-aow-reference-resource": "locations" } } },
    ]);
    const issues = validateTargetRuntime({
      formatVersion: 1,
      preparation: { startingLocationId: "location-1", locationCanvases: [{ locationId: "missing-location", layers: [] }], extensions: { "test:linked": "missing-location" } },
      plotProgress: [{ campaignInstanceId: "instance-1", plotDefinitionId: "plot-1", status: "active", objectiveProgress: [{ objectiveId: "missing-objective", status: "active" }], revealedClaimIds: ["missing-claim"], creatureKnowledge: [{ kind: "heard-rumor", creatureId: "missing-entity", claimId: "missing-claim" }], locationRealizations: [{ plotLocationContextId: "missing-context", actors: [{ actorPlacementIntentId: "actor-intent", runtimeActorId: "missing-entity", runtimePlacementId: "missing-placement" }], items: [{ itemPlacementIntentId: "item-intent", runtimeItemId: "missing-item" }] }] }],
      placementRealizations: [],
      creatureEmbodiments: [{ campaignInstanceId: "instance-1", runtimeCreatureId: "runtime-creature", runtimeEntityId: "runtime-entity", source: { kind: "captured-world-creature", sourceCreatureId: "creature-1", embodimentPolicy: { policy: { strategy: "one-per-instance", maximumPerCampaignInstance: 1 }, source: "explicit" } }, creature: { identity: { id: "runtime-creature", version: { revision: 1, updatedAt: "2026-09-01T00:00:00.000Z" } }, entityId: "runtime-entity", name: "Warden", definitionId: "item-1", currentLocationId: "missing-location", conformance: { modelSchemaReleaseIds: ["release-1"], conceptId: "concept-1" }, modelValues: { "test:definition": "missing-definition" } } }],
      itemInstances: [{ id: "runtime-item", definitionId: "creature-1", quantity: 1, quality: "standard", location: { kind: "location", locationId: "missing-location" } }],
    }, "instance-1", "snapshot-2", campaign, world);
    const codes = issues.map(({ code }) => code);
    for (const code of [
      "canvas-location-not-captured", "objective-progress-not-captured", "revealed-claim-not-captured", "knowledge-claim-not-captured", "knowledge-creature-not-found", "plot-location-context-not-captured", "plot-actor-intent-not-captured", "plot-actor-not-found", "plot-placement-not-found", "plot-item-intent-not-captured", "plot-item-not-found", "creature-definition-not-captured", "creature-location-not-captured", "item-definition-kind-invalid", "item-location-not-captured", "model-value-reference-invalid", "extension-reference-not-captured",
    ]) expect(codes).toContain(code);
  });

  it("offers and applies Plot-scoped nested mappings without confusing equal local IDs", async () => {
    const setup = fixture();
    const sourceCampaign = revisionManifest("campaign-definition-revision", "campaign-revision-1", 1, [
      {
        resourceType: "plots",
        sourceId: "plot-1",
        payload: { name: "Harbor plot", objectives: [{ id: "objective-old", name: "Old objective" }], discoveries: [], locationContexts: [] },
      },
      {
        resourceType: "plots",
        sourceId: "plot-2",
        payload: { name: "Other plot", objectives: [], discoveries: [], locationContexts: [] },
      },
    ]);
    const targetCampaign = revisionManifest("campaign-definition-revision", "campaign-revision-2", 2, [
      {
        resourceType: "plots",
        sourceId: "plot-1",
        payload: { name: "Harbor plot", objectives: [{ id: "objective-new", name: "New objective" }], discoveries: [], locationContexts: [] },
      },
      {
        resourceType: "plots",
        sourceId: "plot-2",
        payload: { name: "Other plot", objectives: [{ id: "objective-new", name: "Wrong-plot objective" }], discoveries: [], locationContexts: [] },
      },
    ]);
    const targetWorld = revisionManifest("world-definition-revision", "world-revision-2", 2, [{
      resourceType: "locations",
      sourceId: "old-location",
      payload: { name: "Old Harbor" },
    }]);
    setup.instance.currentSnapshot.campaignDefinitionSnapshot.manifest = sourceCampaign;
    setup.instance.runtime.state.plotProgress = [
      {
        campaignInstanceId: "instance-1",
        plotDefinitionId: "plot-1",
        status: "active",
        objectiveProgress: [{ objectiveId: "objective-old", status: "active" }],
      },
      {
        campaignInstanceId: "instance-1",
        plotDefinitionId: "plot-2",
        status: "not-started",
        objectiveProgress: [],
      },
    ];
    setup.target.manifest = targetCampaign;
    setup.target.contentHash = targetCampaign.contentHash;
    setup.target.campaignDefinitionRevision.contentHash = targetCampaign.records[0].contentHash;
    setup.target.capturedWorldSnapshot.manifest = targetWorld;
    setup.target.capturedWorldSnapshot.contentHash = targetWorld.contentHash;
    setup.target.capturedWorldSnapshot.worldDefinitionRevision.contentHash = targetWorld.records[0].contentHash;
    const service = new CampaignInstanceMigrationsService(setup.prisma as never);
    const request = {
      sourceSnapshotId: "instance-snapshot-1" as never,
      targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
      expectedRuntimeRevision: 3,
    };

    const unresolved = await service.preview("instance-1", "gm-1", request);
    expect(unresolved.ready).toBe(false);
    expect(unresolved.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: "plot-objectives", mappingRequired: true }),
    ]));
    expect(unresolved.mappingCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: "plot-objectives", targetName: "New objective" }),
    ]));
    expect(unresolved.mappingCandidates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ targetName: "Wrong-plot objective" }),
    ]));

    await expect(service.preview("instance-1", "gm-1", {
      ...request,
      mappings: [{
        resourceType: "plot-objectives",
        sourceId: scopedMigrationReference(["plot-1"], "objective-old"),
        targetId: scopedMigrationReference(["plot-2"], "objective-new"),
      }],
    })).rejects.toThrow(
      "Nested migration mappings must remain within the mapped parent Plot",
    );

    const candidate = unresolved.mappingCandidates.find(
      ({ resourceType }) => resourceType === "plot-objectives",
    );
    expect(candidate?.sourceId.length).toBeLessThanOrEqual(240);
    expect(candidate?.targetId.length).toBeLessThanOrEqual(240);
    const resolved = await service.preview("instance-1", "gm-1", {
      ...request,
      mappings: [{
        resourceType: "plot-objectives",
        sourceId: candidate?.sourceId ?? "missing",
        targetId: candidate?.targetId ?? "missing",
      }],
    });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.ready).toBe(true);
  });

  it("keeps scoped mapping keys within the request boundary for maximum-length IDs", () => {
    const key = scopedMigrationReference(["p".repeat(240), "c".repeat(240)], "i".repeat(240));
    expect(key).toMatch(/^nested:[a-f0-9]{64}$/);
    expect(key.length).toBeLessThanOrEqual(240);
  });
  it("previews only a direct successor and includes World-only changes", async () => {
    const { prisma } = fixture();
    const service = new CampaignInstanceMigrationsService(prisma as never);
    const result = await service.preview("instance-1", "gm-1", {
      sourceSnapshotId: "instance-snapshot-1" as never,
      targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
      expectedRuntimeRevision: 3,
      mappings: [
        { resourceType: "locations", sourceId: "old-location", targetId: "new-location" },
      ],
    });
    expect(result).toMatchObject({ kind: "migration", ready: true, totalChanges: 1 });

    prisma.campaignDefinitionSnapshot.findFirst.mockResolvedValue({
      ...fixture().target,
      campaignDefinitionRevision: {
        ...fixture().target.campaignDefinitionRevision,
        predecessorRevisionId: "different-revision",
      },
    });
    await expect(
      service.preview("instance-1", "gm-1", {
        sourceSnapshotId: "instance-snapshot-1" as never,
        targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
        expectedRuntimeRevision: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks preview while a Session is active", async () => {
    const { prisma } = fixture({ name: "The Return" });
    const result = await new CampaignInstanceMigrationsService(prisma as never).preview(
      "instance-1",
      "gm-1",
      {
        sourceSnapshotId: "instance-snapshot-1" as never,
        targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
        expectedRuntimeRevision: 3,
        mappings: [
          { resourceType: "locations", sourceId: "old-location", targetId: "new-location" },
        ],
      },
    );
    expect(result.ready).toBe(false);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "active-session" })]),
    );
  });

  it("rejects mappings across resource namespaces", async () => {
    const { prisma } = fixture();
    await expect(
      new CampaignInstanceMigrationsService(prisma as never).preview(
        "instance-1",
        "gm-1",
        {
          sourceSnapshotId: "instance-snapshot-1" as never,
          targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
          expectedRuntimeRevision: 3,
          mappings: [
            { resourceType: "plots", sourceId: "old-location", targetId: "new-location" },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("pages changes, conflicts, and human-labeled mapping candidates independently", async () => {
    const setup = fixture();
    const sourceWorld = revisionManifest(
      "world-definition-revision",
      "world-revision-1",
      1,
      [
        { resourceType: "locations", sourceId: "old-location", payload: { name: "Old Harbor" } },
        { resourceType: "locations", sourceId: "old-tower", payload: { name: "Old Tower" } },
      ],
    );
    const targetWorld = revisionManifest(
      "world-definition-revision",
      "world-revision-2",
      2,
      [
        { resourceType: "locations", sourceId: "new-location", payload: { name: "New Harbor" } },
        { resourceType: "locations", sourceId: "new-tower", payload: { name: "New Tower" } },
      ],
    );
    setup.instance.currentSnapshot.worldDefinitionSnapshot.manifest = sourceWorld;
    setup.target.capturedWorldSnapshot.manifest = targetWorld;
    setup.target.capturedWorldSnapshot.contentHash = targetWorld.contentHash;
    setup.target.capturedWorldSnapshot.worldDefinitionRevision.contentHash =
      targetWorld.records[0].contentHash;

    const result = await new CampaignInstanceMigrationsService(
      setup.prisma as never,
    ).preview("instance-1", "gm-1", {
      sourceSnapshotId: "instance-snapshot-1" as never,
      targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
      expectedRuntimeRevision: 3,
      changeOffset: 1,
      changeLimit: 1,
      conflictOffset: 0,
      conflictLimit: 1,
      candidateOffset: 2,
      candidateLimit: 1,
    });

    expect(result).toMatchObject({
      totalChanges: 4,
      changeOffset: 1,
      nextChangeOffset: 2,
      totalConflicts: 3,
      conflictOffset: 0,
      nextConflictOffset: 1,
      totalMappingCandidates: 4,
      candidateOffset: 2,
      nextCandidateOffset: 3,
    });
    expect(result.changes).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.mappingCandidates).toHaveLength(1);
    expect(result.mappingCandidates[0]).toMatchObject({
      resourceType: "locations",
      targetTypeLabel: "locations",
    });
    expect(result.mappingCandidates[0].targetName).toMatch(/New/);
  });

  it("applies atomically after locking Sessions and rewrites only typed references", async () => {
    const setup = fixture();
    const sourceCampaign = revisionManifest("campaign-definition-revision", "campaign-revision-1", 1, [{
      resourceType: "plots",
      sourceId: "plot-1",
      payload: {
        name: "Harbor plot",
        objectives: [{ id: "objective-old", name: "Old objective" }],
        discoveries: [{ claims: [{ id: "claim-old", statement: "Old claim" }] }],
        locationContexts: [{
          id: "context-old",
          actorPlacements: [{ id: "actor-old" }],
          itemPlacements: [{ id: "item-old" }],
        }],
      },
    }]);
    const targetCampaign = revisionManifest("campaign-definition-revision", "campaign-revision-2", 2, [{
      resourceType: "plots",
      sourceId: "plot-1",
      payload: {
        name: "Harbor plot",
        objectives: [{ id: "objective-new", name: "New objective" }],
        discoveries: [{ claims: [{ id: "claim-new", statement: "New claim" }] }],
        locationContexts: [{
          id: "context-new",
          actorPlacements: [{ id: "actor-new" }],
          itemPlacements: [{ id: "item-new" }],
        }],
      },
    }]);
    setup.instance.currentSnapshot.campaignDefinitionSnapshot.manifest = sourceCampaign;
    setup.target.manifest = targetCampaign;
    setup.target.contentHash = targetCampaign.contentHash;
    setup.target.campaignDefinitionRevision.contentHash =
      targetCampaign.records[0].contentHash;
    setup.runtimeState.plotProgress = [{
      campaignInstanceId: "instance-1",
      plotDefinitionId: "plot-1",
      status: "active",
      objectiveProgress: [{ objectiveId: "objective-old", status: "active" }],
      revealedClaimIds: ["claim-old"],
      creatureKnowledge: [{
        kind: "heard-rumor",
        creatureId: "runtime-entity",
        claimId: "claim-old",
      }],
      locationRealizations: [{
        plotLocationContextId: "context-old",
        actors: [{ actorPlacementIntentId: "actor-old", runtimeActorId: "runtime-entity" }],
        items: [{ itemPlacementIntentId: "item-old", runtimeItemId: "runtime-item" }],
      }],
    }];
    setup.runtimeState.creatureEmbodiments = [{
      campaignInstanceId: "instance-1",
      runtimeCreatureId: "runtime-creature",
      runtimeEntityId: "runtime-entity",
      source: {
        kind: "instance-created-creature",
        embodimentPolicy: {
          policy: { strategy: "one-per-realization" },
          source: "explicit",
        },
      },
      creature: {
        identity: {
          id: "runtime-creature",
          version: { revision: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
        },
        entityId: "runtime-entity",
        name: "Guide",
      },
    }];
    setup.runtimeState.itemInstances = [{
      id: "runtime-item",
      definitionId: "runtime-item-definition",
      quantity: 1,
      quality: "standard",
      location: { kind: "carried", carrierId: "runtime-entity" },
    }];
    const sourceWorld = revisionManifest("world-definition-revision", "world-revision-1", 1, [
      { resourceType: "locations", sourceId: "old-location", payload: { name: "Old Harbor" } },
      { resourceType: "definitions", sourceId: "runtime-item-definition", payload: { kind: "item", name: "Token" } },
    ]);
    const targetWorld = revisionManifest("world-definition-revision", "world-revision-2", 2, [
      { resourceType: "locations", sourceId: "new-location", payload: { name: "New Harbor" } },
      { resourceType: "definitions", sourceId: "runtime-item-definition", payload: { kind: "item", name: "Token" } },
    ]);
    setup.instance.currentSnapshot.worldDefinitionSnapshot.manifest = sourceWorld;
    setup.target.capturedWorldSnapshot.manifest = targetWorld;
    setup.target.capturedWorldSnapshot.contentHash = targetWorld.contentHash;
    setup.target.capturedWorldSnapshot.worldDefinitionRevision.contentHash =
      targetWorld.records[0].contentHash;
    const request = {
      sourceSnapshotId: "instance-snapshot-1" as never,
      targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
      expectedRuntimeRevision: 3,
      mappings: [
        { resourceType: "locations", sourceId: "old-location", targetId: "new-location" },
        { resourceType: "plot-objectives", sourceId: scopedMigrationReference(["plot-1"], "objective-old"), targetId: scopedMigrationReference(["plot-1"], "objective-new") },
        { resourceType: "plot-claims", sourceId: scopedMigrationReference(["plot-1"], "claim-old"), targetId: scopedMigrationReference(["plot-1"], "claim-new") },
        { resourceType: "plot-location-contexts", sourceId: scopedMigrationReference(["plot-1"], "context-old"), targetId: scopedMigrationReference(["plot-1"], "context-new") },
        { resourceType: "plot-actor-intents", sourceId: scopedMigrationReference(["plot-1", "context-old"], "actor-old"), targetId: scopedMigrationReference(["plot-1", "context-new"], "actor-new") },
        { resourceType: "plot-item-intents", sourceId: scopedMigrationReference(["plot-1", "context-old"], "item-old"), targetId: scopedMigrationReference(["plot-1", "context-new"], "item-new") },
      ],
    };
    const preview = await new CampaignInstanceMigrationsService(
      setup.prisma as never,
    ).preview("instance-1", "gm-1", request);
    const runtimeUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const lock = jest.fn().mockResolvedValue(0);
    const tx = {
      ...setup.prisma,
      $executeRawUnsafe: lock,
      campaignInstance: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(setup.instance)
          .mockResolvedValueOnce({
            id: "instance-1",
            name: "Tuesday Glasswake",
            status: "PREPARING",
            campaignDefinitionId: "campaign-definition-1",
            currentSnapshot: {
              id: "instance-snapshot-1",
              snapshotNumber: 1,
              campaignDefinitionSnapshot: { manifest: setup.instance.currentSnapshot.campaignDefinitionSnapshot.manifest },
              worldDefinitionSnapshot: { manifest: setup.instance.currentSnapshot.worldDefinitionSnapshot.manifest },
            },
            runtime: {
              id: "runtime-1",
              revision: 3,
              state: setup.runtimeState,
              extensions: {},
            },
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      campaignDefinitionSnapshot: {
        findFirst: jest.fn().mockResolvedValue(setup.target),
      },
      campaignInstanceSession: { findFirst: jest.fn().mockResolvedValue(null) },
      campaignInstanceRuntimeCheckpoint: {
        count: jest.fn().mockResolvedValue(1),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: "checkpoint-source" })
          .mockResolvedValueOnce({ id: "checkpoint-result" }),
      },
      campaignInstanceSnapshot: {
        create: jest.fn().mockResolvedValue({
          id: "instance-snapshot-2",
          snapshotNumber: 2,
          reason: "MIGRATION",
          adoptedAt: new Date("2026-09-02T01:00:00.000Z"),
        }),
        findFirst: jest.fn(),
      },
      campaignInstanceRuntime: { updateMany: runtimeUpdate },
      campaignInstanceMigrationAudit: { create: jest.fn().mockResolvedValue({}) },
      campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const result = await new CampaignInstanceMigrationsService(prisma as never).apply(
      "instance-1",
      "gm-1",
      { ...request, planHash: preview.planHash },
    );
    expect(result).toMatchObject({ kind: "migration", runtimeRevision: 4 });
    expect(lock).toHaveBeenCalledWith(
      'LOCK TABLE "CampaignInstanceSession" IN SHARE MODE',
    );
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      tx.campaignInstance.findFirst.mock.invocationCallOrder[0],
    );
    const serializedRuntimeUpdate = JSON.stringify(runtimeUpdate.mock.calls);
    expect(serializedRuntimeUpdate).toContain('"startingLocationId":"new-location"');
    expect(serializedRuntimeUpdate).toContain('"test:note":"old-location"');
    expect(serializedRuntimeUpdate).toContain('"objectiveId":"objective-new"');
    expect(serializedRuntimeUpdate).toContain('"claimId":"claim-new"');
    expect(serializedRuntimeUpdate).toContain('"plotLocationContextId":"context-new"');
    expect(serializedRuntimeUpdate).toContain('"actorPlacementIntentId":"actor-new"');
    expect(serializedRuntimeUpdate).toContain('"itemPlacementIntentId":"item-new"');
    expect(serializedRuntimeUpdate).not.toContain('nested:');
    expect(tx.campaignInstanceRuntimeCheckpoint.create).toHaveBeenCalledTimes(2);
    expect(tx.campaignInstanceMigrationAudit.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx.campaignInstanceAuditEvent.create.mock.calls)).toContain(
      '"action":"instance.version.migrated","subjectName":"Tuesday Glasswake"',
    );
  });

  it("pages a high-cardinality candidate product without materializing it", async () => {
    const setup = fixture();
    const count = 1_200;
    const sourceWorld = revisionManifest(
      "world-definition-revision",
      "world-revision-1",
      1,
      Array.from({ length: count }, (_, index) => ({
        resourceType: "locations",
        sourceId: `source-${String(index).padStart(4, "0")}`,
        payload: { name: `Source ${String(index).padStart(4, "0")}` },
      })),
    );
    const targetWorld = revisionManifest(
      "world-definition-revision",
      "world-revision-2",
      2,
      Array.from({ length: count }, (_, index) => ({
        resourceType: "locations",
        sourceId: `target-${String(index).padStart(4, "0")}`,
        payload: { name: `Target ${String(index).padStart(4, "0")}` },
      })),
    );
    setup.instance.currentSnapshot.worldDefinitionSnapshot.manifest = sourceWorld;
    setup.instance.runtime.state = {
      ...setup.instance.runtime.state,
      preparation: { startingLocationId: "target-0000", extensions: { "test:note": "unchanged" } },
    };
    setup.target.capturedWorldSnapshot.manifest = targetWorld;
    setup.target.capturedWorldSnapshot.contentHash = targetWorld.contentHash;
    setup.target.capturedWorldSnapshot.worldDefinitionRevision.contentHash =
      targetWorld.records[0].contentHash;

    const result = await new CampaignInstanceMigrationsService(
      setup.prisma as never,
    ).preview("instance-1", "gm-1", {
      sourceSnapshotId: "instance-snapshot-1" as never,
      targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never,
      expectedRuntimeRevision: 3,
      candidateOffset: count * count - 1,
      candidateLimit: 1,
      conflictLimit: 1,
      changeLimit: 1,
    });

    expect(result.totalMappingCandidates).toBe(count * count);
    expect(result.mappingCandidates).toEqual([
      expect.objectContaining({
        conflictKey: "locations:source-1199",
        targetId: "target-1199",
      }),
    ]);
    expect(result.nextCandidateOffset).toBeUndefined();
  });

  it("restores only the direct predecessor as a new current snapshot", async () => {
    const setup = fixture();
    const restoringInstance = {
      ...setup.instance,
      currentSnapshot: {
        ...setup.instance.currentSnapshot,
        predecessorSnapshotId: "instance-snapshot-0",
      },
    };
    setup.prisma.campaignInstance.findFirst.mockResolvedValue(restoringInstance);
    setup.prisma.campaignInstanceSnapshot.findFirst
      .mockResolvedValueOnce({ campaignDefinitionSnapshotId: "campaign-snapshot-2" })
      .mockResolvedValueOnce({ id: "instance-snapshot-0" });
    const result = await new CampaignInstanceMigrationsService(
      setup.prisma as never,
    ).previewRestore("instance-1", "gm-1", {
      sourceSnapshotId: "instance-snapshot-1" as never,
      targetInstanceSnapshotId: "instance-snapshot-0" as never,
      expectedRuntimeRevision: 3,
      mappings: [
        { resourceType: "locations", sourceId: "old-location", targetId: "new-location" },
      ],
    });
    expect(result.kind).toBe("restore");
    expect(result.source.snapshotNumber).toBe(1);
  });
});

describe("canonical Creature Instance adoption", () => {
  it("keeps exact Creature identity through canonical resource conversion", async () => {
    const setup = fixture();
    const source = revisionManifest("world-definition-revision", "world-revision-1", 1, [{ resourceType: "locations", sourceId: "old-location", payload: { name: "Old Harbor" } }, { resourceType: "creatures", sourceId: "same-creature", payload: { identity: { name: "Original name" } } }]);
    const target = revisionManifest("world-definition-revision", "world-revision-2", 2, [{ resourceType: "locations", sourceId: "new-location", payload: { name: "New Harbor" } }, { resourceType: "definitions", sourceId: "same-creature", payload: { kind: "creature", identity: { name: "Renamed creature" } } }]);
    setup.instance.currentSnapshot.worldDefinitionSnapshot.manifest = source;
    setup.target.capturedWorldSnapshot.manifest = target;
    setup.target.capturedWorldSnapshot.contentHash = target.contentHash;
    setup.target.capturedWorldSnapshot.worldDefinitionRevision.contentHash = target.records[0].contentHash;
    const result = await new CampaignInstanceMigrationsService(setup.prisma as never).preview("instance-1", "gm-1", { sourceSnapshotId: "instance-snapshot-1" as never, targetCampaignDefinitionSnapshotId: "campaign-snapshot-2" as never, expectedRuntimeRevision: 3, mappings: [{ resourceType: "locations", sourceId: "old-location", targetId: "new-location" }] });
    expect(result.ready).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.changes).toContainEqual(expect.objectContaining({ subjectName: "Original name", change: "changed" }));
  });
});


describe("new captured Plot progress initialization", () => {
  const manifest = (plots: Array<{ id: string; objectives?: string[] }>) => revisionManifest(
    "campaign-definition-revision", "revision", 1, plots.map(plot => ({resourceType: "plots", sourceId: plot.id,
      payload: { objectives: (plot.objectives ?? []).map(id => ({id})) }})));
  it("initializes each newly captured root and subplot with exact Instance scope without changing input", () => {
    const state = {plotProgress: []};
    const result = initializeAddedPlotProgress(state, "instance", manifest([]), manifest([
      {id: "root", objectives: ["goal"]}, {id: "child"},
    ]), new Map());
    expect(result).toEqual({plotProgress: [
      {campaignInstanceId: "instance", plotDefinitionId: "root", status: "not-started", objectiveProgress: [{objectiveId: "goal", status: "not-started"}]},
      {campaignInstanceId: "instance", plotDefinitionId: "child", status: "not-started", objectiveProgress: []},
    ]});
    expect(state.plotProgress).toEqual([]);
  });
  it("preserves prior status and missing source progress; only initializes newly captured objectives", () => {
    const entry = {campaignInstanceId: "instance", plotDefinitionId: "root", status: "active", objectiveProgress: [{objectiveId: "old", status: "completed"}]};
    const result = initializeAddedPlotProgress({plotProgress: [entry]}, "instance",
      manifest([{id: "root", objectives: ["old", "missing"]}, {id: "missing-source"}]),
      manifest([{id: "root", objectives: ["old", "missing", "new"]}, {id: "missing-source"}]), new Map());
    expect(result).toEqual({plotProgress: [{...entry, objectiveProgress: [...entry.objectiveProgress, {objectiveId: "new", status: "not-started"}]}]});
  });
  it("leaves restore state untouched", () => {
    const state = {plotProgress: []};
    expect(initializeAddedPlotProgress(state, "instance", manifest([]), manifest([{id: "root"}]), new Map(), false)).toBe(state);
  });
  it("does not reset or duplicate mapped Plot and objective progress", () => {
    const entry = {campaignInstanceId: "instance", plotDefinitionId: "new-plot", status: "completed", objectiveProgress: [{objectiveId: "new-goal", status: "completed"}]};
    expect(initializeAddedPlotProgress({plotProgress: [entry]}, "instance", manifest([{id: "old-plot", objectives: ["old-goal"]}]),
      manifest([{id: "new-plot", objectives: ["new-goal"]}]), new Map([
        ["plots:old-plot", "new-plot"],
        [`plot-objectives:${scopedMigrationReference(["old-plot"], "old-goal")}`, scopedMigrationReference(["new-plot"], "new-goal")],
      ]))).toEqual({plotProgress: [entry]});
  });
});
