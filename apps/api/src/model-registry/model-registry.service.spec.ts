import {
  mergeCompiledRootElements,
  ModelRegistryService,
  isApplicableToCampaign,
} from "./model-registry.service";
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  CORE_MODEL_ELEMENT_IDS,
  CORE_MODEL_SCHEMA_RELEASE_ID,
  createEditableCoreModelSeed,
} from "./editable-core-model-seed";
import {
  compileModelSchemaRelease,
  modelElementRevisionContentHash,
  modelSchemaReleaseContentHash,
} from "./model-registry-compiler";

const likeable = {
  key: "custom:attribute-likeable",
  kind: "vocabulary-option",
  semanticRole: "aow:attribute",
  applicability: { kind: "global" },
  payload: {
    kind: "vocabulary-option",
    vocabularyId: CORE_MODEL_ELEMENT_IDS.attributes,
  },
  presentation: { label: "Likeable" },
};

function persistedCore() {
  const seed = createEditableCoreModelSeed();
  const now = new Date(seed.release.identity.publishedAt);
  return {
    seed,
    modelSchemaRelease: {
      findFirst: jest.fn().mockResolvedValue({
        id: seed.release.identity.id,
        registryId: seed.release.identity.lineageId,
        revisionNumber: 1,
        predecessorRevisionId: null,
        name: seed.release.name,
        elementSelections: seed.release.elementSelections,
        dependencies: [],
        contentHash: seed.release.identity.contentHash,
        publishedByUserId: null,
        publishedAt: now,
        registry: {
          id: seed.registry.identity.id,
          key: seed.registry.key,
          name: seed.registry.name,
          description: null,
          provenance: seed.registry.provenance,
          ownerUserId: null,
          metadataRevision: 1,
          createdAt: now,
          updatedAt: now,
        },
      }),
    },
    modelElementLineage: {
      findMany: jest.fn().mockResolvedValue(
        seed.lineages.map((lineage) => ({
          ...lineage,
          status: "ACTIVE",
          metadataRevision: 1,
          currentRevision: null,
        })),
      ),
    },
    modelElementRevision: {
      findMany: jest.fn().mockResolvedValue(
        seed.revisions.map((revision) => ({
          id: revision.identity.id,
          elementId: revision.identity.lineageId,
          revisionNumber: revision.identity.revisionNumber,
          predecessorRevisionId: null,
          payload: revision.payload,
          presentation: revision.presentation,
          dependencies: revision.dependencies ?? [],
          source: revision.source ?? null,
          contentHash: revision.identity.contentHash,
          authoredByUserId: null,
          publishedAt: now,
        })),
      ),
    },
  };
}

function persistedRelease(
  registryId: string,
  selections: Array<{ elementId: string; elementRevisionId: string }>,
  publishedAt: Date,
) {
  const common = {
    identity: {
      id: "release-1",
      lineageId: registryId,
      revisionNumber: 1,
      publishedAt: publishedAt.toISOString(),
      contentHash: "",
    },
    name: "Custom 1",
    elementSelections: selections,
    dependencies: [{ releaseId: CORE_MODEL_SCHEMA_RELEASE_ID }],
    publishedByUserId: "gm-1",
  };
  return {
    id: common.identity.id,
    registryId,
    revisionNumber: 1,
    predecessorRevisionId: null,
    name: common.name,
    elementSelections: selections,
    dependencies: common.dependencies,
    contentHash: modelSchemaReleaseContentHash(common as never),
    publishedByUserId: "gm-1",
    publishedAt,
  };
}

function editableRegistryState() {
  const core = persistedCore();
  const now = new Date("2026-09-06T15:00:00.000Z");
  const revision = {
    id: "revision-old",
    elementId: "element-old",
    revisionNumber: 1,
    predecessorRevisionId: null,
    payload: likeable.payload,
    presentation: { label: "Likeable", order: 1 },
    dependencies: [],
    source: null,
    contentHash: "",
    authoredByUserId: "gm-1",
    publishedAt: now,
  };
  revision.contentHash = modelElementRevisionContentHash({
    identity: {
      id: revision.id as never,
      lineageId: revision.elementId as never,
      revisionNumber: revision.revisionNumber,
      publishedAt: revision.publishedAt.toISOString(),
      contentHash: "",
    },
    payload: revision.payload as never,
    presentation: revision.presentation,
    authoredByUserId: "gm-1" as never,
  });
  const lineage = {
    id: "element-old",
    registryId: "registry-1",
    key: likeable.key,
    kind: likeable.kind,
    semanticRole: likeable.semanticRole,
    applicability: likeable.applicability,
    status: "ACTIVE",
    currentRevisionId: revision.id,
    metadataRevision: 1,
    currentRevision: null,
  };
  const registry = {
    id: "registry-1",
    key: "custom:models",
    name: "Custom Models",
    description: null,
    provenance: { kind: "gm", namespace: "custom", ownerUserId: "gm-1" },
    ownerUserId: "gm-1",
    metadataRevision: 1,
    createdAt: now,
    updatedAt: now,
  };
  let releaseData: Record<string, unknown> | undefined;
  const tx = {
    modelRegistry: { findUnique: jest.fn().mockResolvedValue(registry) },
    modelSchemaRelease: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          persistedRelease(
            registry.id,
            [{ elementId: lineage.id, elementRevisionId: revision.id }],
            now,
          ),
        ),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          releaseData = data;
          return Promise.resolve({ ...data, publishedAt: now });
        }),
    },
    modelElementLineage: {
      findMany: jest.fn().mockResolvedValue([lineage]),
      create: jest.fn(),
      update: jest.fn(),
    },
    modelElementRevision: {
      findMany: jest.fn().mockResolvedValue([revision]),
      create: jest.fn(),
    },
    modelMigrationPlan: { create: jest.fn() },
  };
  return {
    prisma: {
      ...core,
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    },
    tx,
    releaseData: () => releaseData,
  };
}

describe("ModelRegistryService", () => {
  it("deduplicates identical dependency elements shared by unrelated root releases", () => {
    const seed = createEditableCoreModelSeed();
    const core = compileModelSchemaRelease({
      registry: seed.registry,
      release: seed.release,
      lineages: seed.lineages,
      revisions: seed.revisions,
    });
    const first = { ...core, releaseId: "root-one" as never };
    const second = { ...core, releaseId: "root-two" as never };
    expect(mergeCompiledRootElements([first, second])).toHaveLength(
      core.elements.length,
    );
    const changed = {
      ...second,
      elements: [
        {
          ...core.elements[0],
          revision: {
            ...core.elements[0].revision,
            identity: {
              ...core.elements[0].revision.identity,
              id: "different" as never,
            },
          },
        },
      ],
    };
    expect(() => mergeCompiledRootElements([first, changed])).toThrow(
      BadRequestException,
    );
  });

  it("resolves effective elements only from the World draft's exact core release", async () => {
    const core = persistedCore();
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          draft: {
            content: {
              modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
            },
          },
        }),
      },
      modelSchemaRelease: core.modelSchemaRelease,
      modelElementLineage: core.modelElementLineage,
      modelElementRevision: core.modelElementRevision,
    };
    const service = new ModelRegistryService(prisma as never);
    const result = await service.effective("world-1", "gm-1");
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0]?.name).toBe("Editable Core Model 1");
    expect(result.releases[0]?.revisionNumber).toBe(1);
    const wisdom = result.attributes.find(
      (element) => element.currentRevision.presentation.label === "Wisdom",
    );
    expect(wisdom?.semanticRole).toBe("aow:attribute");
    const pack = result.equipmentSlots.find(
      (element) => element.currentRevision.presentation.label === "Pack",
    );
    expect(pack).toBeDefined();
    expect(
      result.professionRanks.map(
        (element) => element.currentRevision.presentation.label,
      ),
    ).toContain("Novice");
  });

  it("resolves Campaign models across global, captured World, and exact Campaign scopes", () => {
    expect(
      isApplicableToCampaign({ kind: "global" }, "world-1", "campaign-1"),
    ).toBe(true);
    expect(
      isApplicableToCampaign(
        { kind: "world", worldDefinitionId: "world-1" },
        "world-1",
        "campaign-1",
      ),
    ).toBe(true);
    expect(
      isApplicableToCampaign(
        { kind: "campaign-definition", campaignDefinitionId: "campaign-1" },
        "world-1",
        "campaign-1",
      ),
    ).toBe(true);
    expect(
      isApplicableToCampaign(
        { kind: "campaign-definition", campaignDefinitionId: "other" },
        "world-1",
        "campaign-1",
      ),
    ).toBe(false);
  });

  it("refuses to extend a registry the GM does not own", async () => {
    const core = persistedCore();
    const tx = {
      modelRegistry: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      ...core,
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new ModelRegistryService(prisma as never);
    await expect(
      service.extendRelease(
        "other-registry",
        { name: "Custom 1", elements: [likeable] },
        "gm-1",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to author a migration plan for a registry the GM does not own", async () => {
    const prisma = {
      modelRegistry: { findUnique: jest.fn().mockResolvedValue(null) },
      modelSchemaRelease: { findFirst: jest.fn() },
    };
    const service = new ModelRegistryService(prisma as never);
    await expect(
      service.createMigrationPlan(
        "other-registry",
        {
          sourceReleaseId: "release-1",
          targetReleaseId: "release-2",
          mappings: [],
        },
        "gm-1",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.modelSchemaRelease.findFirst).not.toHaveBeenCalled();
  });

  it("requires the exact current predecessor before extending", async () => {
    const core = persistedCore();
    const tx = {
      modelRegistry: {
        findUnique: jest.fn().mockResolvedValue({ id: "registry-1" }),
      },
      modelSchemaRelease: {
        findFirst: jest.fn().mockResolvedValue({ id: "release-current" }),
      },
    };
    const prisma = {
      ...core,
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new ModelRegistryService(prisma as never);
    await expect(
      service.extendRelease(
        "registry-1",
        {
          name: "Custom 2",
          predecessorRevisionId: "release-stale",
          elements: [likeable],
        },
        "gm-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("publishes a first GM extension that locks the persisted core release", async () => {
    const core = persistedCore();
    const now = new Date("2026-09-05T15:00:00.000Z");
    let releaseData: unknown;
    const tx = {
      modelRegistry: {
        findUnique: jest.fn().mockResolvedValue({
          id: "registry-1",
          key: "custom:models",
          name: "Custom Models",
          description: null,
          provenance: {
            kind: "gm",
            namespace: "custom",
            ownerUserId: "gm-1",
          },
          ownerUserId: "gm-1",
          metadataRevision: 1,
          createdAt: now,
          updatedAt: now,
        }),
      },
      modelSchemaRelease: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            releaseData = data;
            return Promise.resolve({ ...data, publishedAt: now });
          }),
      },
      modelElementLineage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      modelElementRevision: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      modelMigrationPlan: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...core,
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new ModelRegistryService(prisma as never);
    const result = await service.extendRelease(
      "registry-1",
      { name: "Custom 1", elements: [likeable] },
      "gm-1",
    );
    const stored = releaseData as {
      dependencies: Array<{ releaseId: string }>;
      elementSelections: unknown[];
    };
    expect(stored.dependencies).toEqual([
      { releaseId: "aow:model-schema-release:core:1" },
    ]);
    expect(stored.elementSelections).toHaveLength(1);
    expect(result.addedElements[0]?.key).toBe("custom:attribute-likeable");
  });

  it("carries prior exact selections into a direct successor", async () => {
    const core = persistedCore();
    const now = new Date("2026-09-05T15:00:00.000Z");
    const previousSelection = {
      elementId: "element-old",
      elementRevisionId: "revision-old",
    };
    const oldRevision = {
      identity: {
        id: "revision-old" as never,
        lineageId: "element-old" as never,
        revisionNumber: 1,
        publishedAt: now.toISOString(),
        contentHash: "",
      },
      payload: {
        kind: "vocabulary-option" as const,
        vocabularyId: CORE_MODEL_ELEMENT_IDS.attributes,
      },
      presentation: { label: "Old" },
      authoredByUserId: "gm-1" as never,
    };
    const oldContentHash = modelElementRevisionContentHash(oldRevision);
    let releaseData: unknown;
    const tx = {
      modelRegistry: {
        findUnique: jest.fn().mockResolvedValue({
          id: "registry-1",
          key: "custom:models",
          name: "Custom Models",
          description: null,
          provenance: {
            kind: "gm",
            namespace: "custom",
            ownerUserId: "gm-1",
          },
          ownerUserId: "gm-1",
          metadataRevision: 1,
          createdAt: now,
          updatedAt: now,
        }),
      },
      modelSchemaRelease: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            persistedRelease("registry-1", [previousSelection], now),
          ),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            releaseData = data;
            return Promise.resolve({ ...data, publishedAt: now });
          }),
      },
      modelElementLineage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "element-old",
            registryId: "registry-1",
            key: "custom:attribute-old",
            kind: "vocabulary-option",
            semanticRole: "aow:attribute",
            applicability: { kind: "global" },
            status: "ACTIVE",
            currentRevisionId: "revision-old",
            metadataRevision: 1,
            currentRevision: null,
          },
        ]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      modelElementRevision: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "revision-old",
            elementId: "element-old",
            revisionNumber: 1,
            predecessorRevisionId: null,
            payload: oldRevision.payload,
            presentation: oldRevision.presentation,
            dependencies: [],
            source: null,
            contentHash: oldContentHash,
            authoredByUserId: "gm-1",
            publishedAt: now,
          },
        ]),
        create: jest.fn().mockResolvedValue({}),
      },
      modelMigrationPlan: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...core,
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new ModelRegistryService(prisma as never);
    await service.extendRelease(
      "registry-1",
      {
        name: "Custom 2",
        predecessorRevisionId: "release-1",
        elements: [{ ...likeable, key: "custom:attribute-new" }],
      },
      "gm-1",
    );
    const stored = releaseData as {
      predecessorRevisionId: string;
      elementSelections: Array<{ elementId: string }>;
    };
    expect(stored.predecessorRevisionId).toBe("release-1");
    expect(stored.elementSelections[0]?.elementId).toBe("element-old");
    expect(stored.elementSelections).toHaveLength(2);
  });

  it("publishes an immutable revision and selects it in the direct successor", async () => {
    const state = editableRegistryState();
    const service = new ModelRegistryService(state.prisma as never);
    const result = await service.extendRelease(
      "registry-1",
      {
        name: "Revise Likeable",
        predecessorRevisionId: "release-1",
        revisions: [
          {
            elementId: "element-old",
            predecessorRevisionId: "revision-old",
            payload: likeable.payload,
            presentation: { label: "Likeable", order: 7 },
          },
        ],
      },
      "gm-1",
    );

    expect(state.tx.modelElementRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest's asymmetric matcher is intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          elementId: "element-old",
          revisionNumber: 2,
          predecessorRevisionId: "revision-old",
          presentation: { label: "Likeable", order: 7 },
        }),
      }),
    );
    expect(result.revisedElements).toEqual([
      expect.objectContaining({ key: likeable.key }),
    ]);
    const selections = state.releaseData()?.elementSelections as Array<{
      elementId: string;
      elementRevisionId: string;
    }>;
    expect(selections).toHaveLength(1);
    expect(selections[0]?.elementId).toBe("element-old");
    expect(selections[0]?.elementRevisionId).not.toBe("revision-old");
    expect(state.tx.modelMigrationPlan.create).toHaveBeenCalledWith({
      // Jest's asymmetric matcher is intentionally dynamic at this assertion boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        sourceReleaseId: "release-1",
        mappings: [],
      }),
    });
  });

  it("archives an element only by omitting it from a new immutable release", async () => {
    const state = editableRegistryState();
    const service = new ModelRegistryService(state.prisma as never);
    const result = await service.extendRelease(
      "registry-1",
      {
        name: "Archive Likeable",
        predecessorRevisionId: "release-1",
        archiveElementIds: ["element-old"],
      },
      "gm-1",
    );

    expect(state.releaseData()?.elementSelections).toEqual([]);
    expect(state.tx.modelElementLineage.update).toHaveBeenCalledWith({
      where: { id: "element-old" },
      data: {
        status: "ARCHIVED",
        // Jest's asymmetric matcher is intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        archivedAt: expect.any(Date),
        metadataRevision: { increment: 1 },
      },
    });
    expect(result.archivedElements).toEqual([
      { id: "element-old", key: likeable.key },
    ]);
    expect(state.tx.modelMigrationPlan.create).toHaveBeenCalledWith({
      // Jest's asymmetric matcher is intentionally dynamic at this assertion boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        sourceReleaseId: "release-1",
        mappings: [{ sourceElementId: "element-old" }],
      }),
    });
  });

  it("performs no writes when complete-release validation fails", async () => {
    const core = persistedCore();
    const now = new Date();
    const create = jest.fn();
    const tx = {
      modelRegistry: {
        findUnique: jest.fn().mockResolvedValue({
          id: "registry-1",
          key: "custom:models",
          name: "Custom Models",
          description: null,
          provenance: {
            kind: "gm",
            namespace: "custom",
            ownerUserId: "gm-1",
          },
          ownerUserId: "gm-1",
          metadataRevision: 1,
          createdAt: now,
          updatedAt: now,
        }),
      },
      modelSchemaRelease: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
      modelElementLineage: {
        findMany: jest.fn().mockResolvedValue([]),
        create,
        update: jest.fn(),
      },
      modelElementRevision: {
        findMany: jest.fn().mockResolvedValue([]),
        create,
      },
    };
    const prisma = {
      ...core,
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new ModelRegistryService(prisma as never);
    await expect(
      service.extendRelease(
        "registry-1",
        { name: "Broken", elements: [{ ...likeable, kind: "concept" }] },
        "gm-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects malformed Model AST payloads before any database access", async () => {
    const prisma = {
      modelSchemaRelease: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new ModelRegistryService(prisma as never);
    await expect(
      service.extendRelease(
        "registry-1",
        {
          name: "Malformed",
          elements: [
            {
              key: "custom:broken-vocabulary",
              kind: "vocabulary",
              semanticRole: "custom:vocabulary",
              applicability: { kind: "global" },
              payload: { kind: "vocabulary", ordered: "no" },
              presentation: { label: "Broken" },
            },
          ],
        },
        "gm-1",
      ),
    ).rejects.toMatchObject({
      // Jest's asymmetric matcher is intentionally dynamic at this assertion boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({
        message: "The Model Element shape is invalid.",
      }),
    });
    expect(prisma.modelSchemaRelease.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
