import {
  mergeCompiledRootElements,
  ModelRegistryService,
} from "./model-registry.service";
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  CORE_MODEL_ELEMENT_IDS,
  createEditableCoreModelSeed,
} from "./editable-core-model-seed";
import {
  compileModelSchemaRelease,
  modelElementRevisionContentHash,
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
        findFirst: jest.fn().mockResolvedValue({
          id: "release-1",
          registryId: "registry-1",
          revisionNumber: 1,
          elementSelections: [previousSelection],
          dependencies: [{ releaseId: "aow:model-schema-release:core:1" }],
        }),
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
