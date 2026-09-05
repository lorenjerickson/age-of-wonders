import { ConflictException, NotFoundException } from "@nestjs/common";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";

describe("CampaignDefinitionsService", () => {
  it("scopes reads to the owning GM and uses a neutral missing response", async () => {
    const prisma = { campaignDefinition: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new CampaignDefinitionsService(prisma as never).get("opaque", "gm-1")).rejects.toEqual(new NotFoundException("The selected Campaign Definition was not found."));
    expect(prisma.campaignDefinition.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "opaque", ownerUserId: "gm-1" } }));
  });
  it("uses optimistic metadata revision for archive", async () => {
    const prisma = { campaignDefinition: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(new CampaignDefinitionsService(prisma as never).archive("campaign", { expectedMetadataRevision: 3 }, "gm-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("revalidates the exact nested draft and makes no publication writes when malformed", async () => {
    const manifest = buildSnapshotManifest(1, [
      { resourceType: "locations", sourceId: "harbor", payload: { id: "harbor", name: "Harbor" } },
    ]);
    const revisionCreate = jest.fn();
    const tx = {
      campaignDefinitionRevision: { findFirst: jest.fn().mockResolvedValue(null), create: revisionCreate },
      campaignDefinition: { findUnique: jest.fn().mockResolvedValue({
        status: "ACTIVE", currentRevisionId: null, currentRevision: null,
        draft: {
          id: "draft", campaignDefinitionId: "campaign", worldDefinitionId: "world",
          baseRevisionId: null, baseSnapshotId: null, capturedWorldSnapshotId: "world-snapshot",
          revisionName: "Draft", storageRevision: 1, validationStatus: "VALID",
          validatedStorageRevision: 1, validationReport: {}, createdAt: new Date(), updatedAt: new Date(),
          content: { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: ["plot"], placementDefinitionIds: [], modelSchemaReleaseIds: [] },
          snapshotRecords: [{ resourceType: "plots", sourceId: "plot", payload: { id: "plot", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Broken", objectives: [null], pressures: [], resistances: [], discoveries: [], locationContexts: [] } }],
          capturedWorldSnapshot: worldSnapshot(manifest),
        },
      }) },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const models = { resolveEffectiveRootsForCampaign: jest.fn().mockResolvedValue({ roots: [], elements: [] }) };
    await expect(new CampaignDefinitionsService(prisma as never, models as never).publish("campaign", { expectedStorageRevision: 1 }, "gm-1"))
      .rejects.toThrow("must pass validation");
    expect(revisionCreate).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing conformance",
      governed: {},
    },
    {
      label: "wrong field type",
      governed: {
        conformance: { modelSchemaReleaseIds: ["world-release", "campaign-release"], conceptId: "plot-concept" },
        modelValues: { "custom:urgency": "urgent" },
      },
    },
    {
      label: "undeclared field",
      governed: {
        conformance: { modelSchemaReleaseIds: ["world-release", "campaign-release"], conceptId: "plot-concept" },
        modelValues: { "custom:urgency": 3, "custom:opaque": true },
      },
    },
  ])("blocks publication for $label in Campaign-governed Plot content", async ({ governed }) => {
    const manifest = buildSnapshotManifest(1, [
      { resourceType: "locations", sourceId: "harbor", payload: { id: "harbor", name: "Harbor" } },
    ]);
    const capturedWorldBase = worldSnapshot(manifest);
    const capturedWorld = {
      ...capturedWorldBase,
      worldDefinitionRevision: {
        ...capturedWorldBase.worldDefinitionRevision,
        modelSchemaSelections: [{ modelSchemaReleaseId: "world-release" }],
      },
    };
    const revisionCreate = jest.fn();
    const draft = {
      id: "draft", campaignDefinitionId: "campaign", worldDefinitionId: "world",
      baseRevisionId: null, baseSnapshotId: null, capturedWorldSnapshotId: "world-snapshot",
      revisionName: "Draft", storageRevision: 1, validationStatus: "VALID",
      validatedStorageRevision: 1, validationReport: {}, createdAt: new Date(), updatedAt: new Date(),
      content: { formatVersion: 1, gmPremise: "Premise", playerIntroduction: "Introduction", plotDefinitionIds: ["plot"], placementDefinitionIds: [], modelSchemaReleaseIds: ["campaign-release"] },
      snapshotRecords: [{ resourceType: "plots", sourceId: "plot", payload: {
        id: "plot", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Governed Plot",
        objectives: [], pressures: [], resistances: [], discoveries: [], locationContexts: [], ...governed,
      } }],
      capturedWorldSnapshot: capturedWorld,
    };
    const tx = {
      campaignDefinitionRevision: { findFirst: jest.fn().mockResolvedValue(null), create: revisionCreate },
      campaignDefinition: { findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", currentRevisionId: null, currentRevision: null, draft }) },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const models = { resolveEffectiveRootsForCampaign: jest.fn().mockResolvedValue({ roots: [], elements: [
      { lineage: { id: "plot-concept", kind: "concept", semanticRole: "aow:plot" }, revision: { payload: { kind: "concept" } } },
      { lineage: { id: "urgency-field", kind: "field", semanticRole: "custom:urgency" }, revision: { payload: { kind: "field", ownerConceptId: "plot-concept", storageKey: "custom:urgency", valueType: { kind: "integer", minimum: 1, maximum: 5 }, cardinality: { minimum: 1, maximum: 1 } } } },
    ] }) };

    await expect(new CampaignDefinitionsService(prisma as never, models as never).publish(
      "campaign", { expectedStorageRevision: 1 }, "gm-1",
    )).rejects.toThrow("must pass validation");
    expect(models.resolveEffectiveRootsForCampaign).toHaveBeenCalledWith(
      ["world-release", "campaign-release"], "gm-1", "world", "campaign",
    );
    expect(revisionCreate).not.toHaveBeenCalled();
  });

  it("auto-migrates exact conformance when successor Model identities and values remain compatible", async () => {
    const source = worldSnapshot(minimalWorldManifest(), "world-release-1", 1, null);
    const target = worldSnapshot(minimalWorldManifest(), "world-release-2", 2, "world-revision");
    const plot = governedPlot({
      conformance: { modelSchemaReleaseIds: ["world-release-1"], conceptId: "plot-concept" },
      modelValues: { "custom:urgency": 3 },
    });
    const models = { resolveEffectiveRootsForCampaign: jest.fn().mockResolvedValue({ roots: [], elements: governedPlotElements() }) };
    const prisma = {} as unknown as ConstructorParameters<typeof CampaignDefinitionsService>[0];
    const service = new CampaignDefinitionsService(prisma, models);
    const assessment = await (service as unknown as {
      assessModelMigration(draft: unknown, target: unknown, userId: string): Promise<{ compatible: boolean; targetReleaseIds: string[] }>;
    }).assessModelMigration({
      campaignDefinitionId: "campaign", worldDefinitionId: "world",
      content: { modelSchemaReleaseIds: [] }, snapshotRecords: [{ resourceType: "plots", sourceId: "plot", payload: plot }],
      capturedWorldSnapshot: source,
    }, target, "gm-1");
    expect(assessment).toMatchObject({ compatible: true, targetReleaseIds: ["world-release-2"] });
  });

  it("blocks migration when a successor introduces a required governed Campaign concept", async () => {
    const source = worldSnapshot(minimalWorldManifest(), "world-release-1", 1, null);
    const target = worldSnapshot(minimalWorldManifest(), "world-release-2", 2, "world-revision");
    const models = { resolveEffectiveRootsForCampaign: jest.fn().mockResolvedValue({ roots: [], elements: governedPlotElements() }) };
    const prisma = {} as unknown as ConstructorParameters<typeof CampaignDefinitionsService>[0];
    const service = new CampaignDefinitionsService(prisma, models);
    const assessment = await (service as unknown as {
      assessModelMigration(draft: unknown, target: unknown, userId: string): Promise<{ compatible: boolean; candidates: { label: string }[] }>;
    }).assessModelMigration({
      campaignDefinitionId: "campaign", worldDefinitionId: "world",
      content: { modelSchemaReleaseIds: [] }, snapshotRecords: [{ resourceType: "plots", sourceId: "plot", payload: governedPlot({}) }],
      capturedWorldSnapshot: source,
    }, target, "gm-1");
    expect(assessment.compatible).toBe(false);
    expect(assessment.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Governed Plot" }),
    ]));
  });

  it("returns the immutable result for an idempotent migration retry without new writes", async () => {
    const manifest = buildSnapshotManifest(1, [
      { resourceType: "locations", sourceId: "harbor", payload: { id: "harbor", name: "Harbor" } },
    ]);
    const campaignLookup = jest.fn();
    const tx = {
      campaignDefinitionWorldMigrationAudit: { findUnique: jest.fn().mockResolvedValue({
        planHash: "a".repeat(64),
        resultCampaignRevision: {
          id: "revision-2", revisionNumber: 2, predecessorRevisionId: "revision-1",
          name: "Migrated", contentHash: "hash", publishedAt: new Date("2026-09-05T00:00:00Z"),
          snapshots: [{ id: "campaign-snapshot-2", contentHash: "snapshot-hash", capturedAt: new Date("2026-09-05T00:00:00Z") }],
          capturedWorldSnapshot: worldSnapshot(manifest),
        },
      }) },
      campaignDefinition: { findUnique: campaignLookup },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    await expect(new CampaignDefinitionsService(prisma as never).applyWorldMigration("campaign", {
      expectedStorageRevision: 4, targetWorldDefinitionSnapshotId: "world-snapshot", expectedPlanHash: "a".repeat(64),
    }, "gm-1")).resolves.toMatchObject({ id: "revision-2", revisionNumber: 2 });
    expect(campaignLookup).not.toHaveBeenCalled();
  });

  it("CAS-resets unpublished edits from the exact current snapshot without deleting history", async () => {
    const content = { formatVersion: 1, gmPremise: "Published", playerIntroduction: "Welcome", plotDefinitionIds: [], placementDefinitionIds: [], modelSchemaReleaseIds: [] };
    const manifest = buildSnapshotManifest(1, [
      { resourceType: "campaign-definition-revision", sourceId: "revision-1", sourceRevision: 1, payload: content },
      { resourceType: "plots", sourceId: "published-plot", payload: { name: "Published Plot" } },
    ]);
    const capturedWorld = worldSnapshot(buildSnapshotManifest(1, [
      { resourceType: "locations", sourceId: "harbor", payload: { name: "Harbor" } },
    ]));
    const draft = {
      id: "draft", campaignDefinitionId: "campaign", worldDefinitionId: "world",
      baseRevisionId: "revision-1", baseSnapshotId: "snapshot-1",
      capturedWorldSnapshotId: "world-snapshot", revisionName: "Edited",
      content: { ...content, gmPremise: "Unpublished" }, snapshotRecords: [],
      storageRevision: 4, validationStatus: "VALID", validatedStorageRevision: 4,
      validationReport: {}, createdAt: new Date(), updatedAt: new Date(),
      capturedWorldSnapshot: capturedWorld,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const deleteMany = jest.fn();
    const tx = {
      campaignDefinition: { findUnique: jest.fn().mockResolvedValue({
        status: "ACTIVE", currentRevisionId: "revision-1", draft,
        currentRevision: { id: "revision-1", revisionNumber: 1, name: "Published", content, capturedWorldSnapshotId: "world-snapshot", snapshots: [{ id: "snapshot-1", manifest }] },
      }) },
      campaignDefinitionDraft: {
        updateMany,
        findUnique: jest.fn().mockResolvedValue({
          ...draft, revisionName: "Published", content,
          snapshotRecords: [{ resourceType: "plots", sourceId: "published-plot", payload: { name: "Published Plot" } }],
          storageRevision: 5, validationStatus: "NOT_VALIDATED",
          validatedStorageRevision: null, validationReport: null,
        }),
        deleteMany,
      },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };

    await expect(new CampaignDefinitionsService(prisma as never).resetDraft(
      "campaign", { expectedStorageRevision: 4 }, "gm-1",
    )).resolves.toMatchObject({ storageRevision: 5, validationStatus: "not-validated" });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "draft", storageRevision: 4 },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        baseSnapshotId: "snapshot-1",
        capturedWorldSnapshotId: "world-snapshot",
        validationStatus: "NOT_VALIDATED",
        validatedStorageRevision: null,
      }),
    }));
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

function worldSnapshot(
  manifest: ReturnType<typeof buildSnapshotManifest>,
  modelReleaseId?: string,
  revisionNumber = 1,
  predecessorRevisionId: string | null = null,
) {
  return {
    id: "world-snapshot", worldDefinitionId: "world", worldDefinitionRevisionId: "world-revision",
    manifest, contentHash: manifest.contentHash, capturedAt: new Date("2026-09-04T00:00:00Z"),
    worldDefinitionRevision: {
      id: revisionNumber === 1 ? "world-revision" : `world-revision-${revisionNumber}`,
      revisionNumber, predecessorRevisionId,
      name: "First", publishedAt: new Date("2026-09-04T00:00:00Z"),
      worldDefinition: { name: "Glasswake", ownerUserId: "gm-1" },
      modelSchemaSelections: modelReleaseId ? [{ modelSchemaReleaseId: modelReleaseId }] : [], successorRevisions: [],
    },
  };
}

function minimalWorldManifest() {
  return buildSnapshotManifest(1, [
    { resourceType: "locations", sourceId: "world", payload: { name: "World" } },
  ]);
}

function governedPlot(extra: Record<string, unknown>) {
  return {
    id: "plot", campaignDefinitionId: "campaign", parent: { kind: "root" },
    name: "Governed Plot", objectives: [], pressures: [], resistances: [],
    discoveries: [], locationContexts: [], ...extra,
  };
}

function governedPlotElements() {
  return [
    { lineage: { id: "plot-concept", kind: "concept", semanticRole: "aow:plot" }, revision: { payload: { kind: "concept" }, presentation: { label: "Governed Plot" } } },
    { lineage: { id: "urgency-field", kind: "field", semanticRole: "custom:urgency" }, revision: { payload: { kind: "field", ownerConceptId: "plot-concept", storageKey: "custom:urgency", valueType: { kind: "integer", minimum: 1, maximum: 5 }, cardinality: { minimum: 1, maximum: 1 } }, presentation: { label: "Urgency" } } },
  ];
}
