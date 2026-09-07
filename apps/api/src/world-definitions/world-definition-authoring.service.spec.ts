import { BadRequestException, ConflictException } from "@nestjs/common";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import {
  assertGovernedRecordConformance,
  WorldDefinitionAuthoringService,
} from "./world-definition-authoring.service";

const now = new Date("2026-09-05T12:00:00.000Z");
const draft = {
  id: "draft-1",
  worldDefinitionId: "world-1",
  baseRevisionId: null,
  baseSnapshotId: null,
  revisionName: "First light",
  content: {
    rootLocationId: "root",
    locationIds: ["root"],
    definitionIds: [],
    schemaDefinitionIds: [],
    worldPlacementDefinitionIds: [],
    modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
  },
  snapshotRecords: [
    {
      resourceType: "locations",
      sourceId: "root",
      payload: { name: "Root", kind: "world", placement: { kind: "root" } },
    },
  ],
  storageRevision: 3,
  validationStatus: "NOT_VALIDATED",
  validatedStorageRevision: null,
  validationReport: null,
  createdAt: now,
  updatedAt: now,
  baseSnapshot: null,
};

function serviceWith(
  prisma: unknown,
  models: unknown = {
    resolveEffectiveRoots: jest
      .fn()
      .mockResolvedValue({ elements: [], roots: [] }),
  },
) {
  return new WorldDefinitionAuthoringService(prisma as never, models as never);
}

describe("WorldDefinitionAuthoringService", () => {
  it("validates Character Definitions against adopted concepts and vocabularies", () => {
    const seed = createEditableCoreModelSeed();
    const compiled = compileModelSchemaRelease(seed);
    const conceptId = (semanticRole: string) => {
      const id = compiled.elements.find(
        ({ lineage }) => lineage.semanticRole === semanticRole,
      )?.lineage.id;
      if (!id) throw new Error(`Missing ${semanticRole} concept in test seed.`);
      return id;
    };
    const conformance = (semanticRole: string) => ({
      modelSchemaReleaseIds: [compiled.releaseId],
      conceptId: conceptId(semanticRole),
    });
    const records: Parameters<typeof assertGovernedRecordConformance>[0] = [
      {
        resourceType: "definitions",
        sourceId: "skill-1",
        payload: {
          kind: "skill",
          conformance: conformance("aow:skill"),
          components: { defaultAttribute: "aow:attribute-wisdom" },
        },
      },
      {
        resourceType: "definitions",
        sourceId: "profession-1",
        payload: {
          kind: "profession",
          conformance: conformance("aow:profession"),
          components: {
            expertiseOrder: ["aow:profession-rank-novice"],
          },
        },
      },
      {
        resourceType: "definitions",
        sourceId: "background-1",
        payload: {
          kind: "background",
          conformance: conformance("aow:background"),
          components: {},
        },
      },
    ];

    expect(() =>
      assertGovernedRecordConformance(
        records,
        [compiled.releaseId],
        compiled.elements,
      ),
    ).not.toThrow();
    expect(() =>
      assertGovernedRecordConformance(
        [
          {
            resourceType: "definitions",
            sourceId: "skill-invalid",
            payload: {
              kind: "skill",
              conformance: conformance("aow:skill"),
              components: { defaultAttribute: "custom:missing-attribute" },
            },
          },
        ],
        [compiled.releaseId],
        compiled.elements,
      ),
    ).toThrow("available default Attribute");
    expect(() =>
      assertGovernedRecordConformance(
        [
          {
            resourceType: "definitions",
            sourceId: "profession-invalid",
            payload: {
              kind: "profession",
              conformance: conformance("aow:profession"),
              components: {
                expertiseOrder: ["custom:missing-profession-rank"],
              },
            },
          },
        ],
        [compiled.releaseId],
        compiled.elements,
      ),
    ).toThrow("available Profession Ranks");
    expect(() =>
      assertGovernedRecordConformance(
        [
          {
            resourceType: "definitions",
            sourceId: "profession-invalid-acquisition",
            payload: {
              kind: "profession",
              conformance: conformance("aow:profession"),
              components: {
                expertiseOrder: ["aow:profession-rank-novice"],
                acquisition: [
                  {
                    kind: "character-creation",
                    startingExpertise: "custom:missing-profession-rank",
                  },
                ],
              },
            },
          },
        ],
        [compiled.releaseId],
        compiled.elements,
      ),
    ).toThrow("available Profession Ranks");
  });

  it("creates a draft-first World with a valid root and explicit core model release", async () => {
    const worldCreate = jest.fn().mockResolvedValue({
      id: "world-1",
      name: "Glasswake",
      description: null,
      metadataRevision: 1,
    });
    let captured: unknown;
    const draftCreate = jest.fn().mockImplementation(
      ({
        data,
      }: {
        data: typeof draft & {
          snapshotRecords: typeof draft.snapshotRecords;
        };
      }) => {
        captured = data;
        return Promise.resolve({ ...draft, ...data });
      },
    );
    const tx = {
      worldDefinition: { create: worldCreate },
      worldDefinitionDraft: { create: draftCreate },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = serviceWith(prisma);
    await service.create({ name: "Glasswake" }, "gm-1");
    const createInput = captured as {
      content: {
        rootLocationId: string;
        locationIds: string[];
        modelSchemaReleaseIds: string[];
      };
      snapshotRecords: Array<{ sourceId: string; payload: { kind: string } }>;
    };
    expect(createInput.content.locationIds).toEqual([
      createInput.content.rootLocationId,
    ]);
    expect(createInput.snapshotRecords[0]?.sourceId).toBe(
      createInput.content.rootLocationId,
    );
    expect(createInput.snapshotRecords[0]?.payload.kind).toBe("world");
    expect(createInput.content.modelSchemaReleaseIds).toEqual([
      "aow:model-schema-release:core:1",
    ]);
  });

  it("rejects an optimistic save after its draft revision changes", async () => {
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          metadataRevision: 1,
          draft,
        }),
      },
      worldDefinitionDraft: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = serviceWith(prisma);
    await expect(
      service.save(
        "world-1",
        {
          expectedStorageRevision: 2,
          revisionName: "Stale",
          content: draft.content,
          records: draft.snapshotRecords,
        },
        "gm-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("starts an existing World draft from its explicitly selected current immutable revision", async () => {
    const legacyContent = {
      rootLocationId: "root",
      locationIds: ["root"],
      definitionIds: [],
      schemaDefinitionIds: [],
    };
    const manifest = {
      formatVersion: 1,
      records: [
        {
          resourceType: "world-definition-revision",
          sourceId: "revision-1",
          sourceRevision: 1,
          payload: legacyContent,
        },
        {
          resourceType: "locations",
          sourceId: "root",
          payload: { name: "Root", kind: "world", placement: { kind: "root" } },
        },
      ],
    };
    // Use the production builder so the immutable manifest hashes are internally consistent.
    const canonical = buildSnapshotManifest(1, manifest.records);
    const create = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...draft,
          ...data,
          baseSnapshot: { manifest: canonical },
        }),
      );
    const tx = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          status: "ACTIVE",
          currentRevisionId: "revision-1",
          draft: null,
          currentRevision: {
            id: "revision-1",
            revisionNumber: 1,
            name: "First light",
            content: legacyContent,
            snapshots: [{ id: "snapshot-1", manifest: canonical }],
          },
        }),
      },
      worldDefinitionDraft: { create },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = serviceWith(prisma);
    const result = await service.startDraft(
      "world-1",
      { baseRevisionId: "revision-1" },
      "gm-1",
    );
    expect(result).toMatchObject({
      baseRevisionId: "revision-1",
      baseSnapshotId: "snapshot-1",
      revisionName: "First light",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest's asymmetric matcher is intentionally dynamic at this mock boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          worldDefinitionId: "world-1",
          baseRevisionId: "revision-1",
          baseSnapshotId: "snapshot-1",
          content: {
            ...legacyContent,
            worldPlacementDefinitionIds: [],
            modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
          },
          snapshotRecords: [
            expect.objectContaining({
              resourceType: "locations",
              sourceId: "root",
            }),
          ],
        }),
      }),
    );
  });

  it("resumes an existing World draft without creating another one", async () => {
    const tx = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          status: "ACTIVE",
          currentRevisionId: "revision-1",
          draft,
          currentRevision: null,
        }),
      },
      worldDefinitionDraft: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = serviceWith(prisma);
    await expect(
      service.startDraft("world-1", { baseRevisionId: "revision-1" }, "gm-1"),
    ).resolves.toMatchObject({ id: "draft-1" });
    expect(tx.worldDefinitionDraft.create).not.toHaveBeenCalled();
  });

  it("ties a validation report to the exact optimistic draft revision", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          metadataRevision: 1,
          draft,
        }),
      },
      worldDefinitionDraft: { updateMany },
    };
    const service = serviceWith(prisma);
    await expect(
      service.validate("world-1", { expectedStorageRevision: 3 }, "gm-1"),
    ).resolves.toEqual({ valid: true, issues: [] });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "draft-1", storageRevision: 3 },
        // Jest's asymmetric matcher is intentionally dynamic at this mock boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          validationStatus: "VALID",
          validatedStorageRevision: 3,
        }),
      }),
    );
  });

  it("merges exact model-closure failures into the persisted validation report", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          metadataRevision: 1,
          draft,
        }),
      },
      worldDefinitionDraft: { updateMany },
    };
    const service = serviceWith(prisma, {
      resolveEffectiveRoots: jest
        .fn()
        .mockRejectedValue(new BadRequestException("Internal model detail")),
    });
    const report = await service.validate(
      "world-1",
      { expectedStorageRevision: 3 },
      "gm-1",
    );
    expect(report.valid).toBe(false);
    expect(report.issues).toEqual([
      {
        code: "model-conformance-invalid",
        subject: "World draft",
        detail:
          "The selected Model Schema releases or governed resources are invalid.",
      },
    ]);
    const blockedDataMatcher: unknown = expect.objectContaining({
      validationStatus: "BLOCKED",
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: blockedDataMatcher }),
    );
    expect(JSON.stringify(report)).not.toContain("Internal model detail");
  });

  it("blocks a Creature Definition that omits exact Model conformance", async () => {
    const creatureDraft = {
      ...draft,
      content: { ...draft.content, definitionIds: ["creature-1"] },
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "definitions",
          sourceId: "creature-1",
          payload: {
            name: "Unbound Creature",
            definitionType: "creature",
            attributes: {},
            equipmentSlots: [],
          },
        },
      ],
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          metadataRevision: 1,
          draft: creatureDraft,
        }),
      },
      worldDefinitionDraft: { updateMany },
    };
    const service = serviceWith(prisma);
    const report = await service.validate(
      "world-1",
      { expectedStorageRevision: 3 },
      "gm-1",
    );
    expect(report.valid).toBe(false);
    expect(report.issues.map(({ code }) => code)).toContain(
      "model-conformance-invalid",
    );
  });

  it("cannot bypass Creature conformance by using the authoritative kind field", async () => {
    const creatureDraft = {
      ...draft,
      content: { ...draft.content, definitionIds: ["creature-1"] },
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "definitions",
          sourceId: "creature-1",
          payload: {
            name: "Unbound Creature",
            kind: "creature",
            attributes: {},
            equipmentSlots: [],
          },
        },
      ],
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          metadataRevision: 1,
          draft: creatureDraft,
        }),
      },
      worldDefinitionDraft: { updateMany },
    };
    const service = serviceWith(prisma);
    const report = await service.validate(
      "world-1",
      { expectedStorageRevision: 3 },
      "gm-1",
    );
    expect(report.valid).toBe(false);
    expect(report.issues.map(({ code }) => code)).toContain(
      "model-conformance-invalid",
    );
  });

  it("returns an existing publication for the same draft revision", async () => {
    const prior = {
      id: "revision-1",
      revisionNumber: 1,
      predecessorRevisionId: null,
      name: "First light",
      contentHash: "revision-hash",
      publishedAt: now,
      snapshots: [
        { id: "snapshot-1", contentHash: "snapshot-hash", capturedAt: now },
      ],
    };
    const tx = {
      worldDefinitionRevision: {
        findFirst: jest.fn().mockResolvedValue(prior),
      },
      worldDefinition: { findUnique: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = serviceWith(prisma);
    await expect(
      service.publish("world-1", { expectedStorageRevision: 3 }, "gm-1"),
    ).resolves.toEqual(
      expect.objectContaining({ id: "revision-1", revisionNumber: 1 }),
    );
    expect(tx.worldDefinition.findUnique).not.toHaveBeenCalled();
  });

  it("requires a valid report for the exact draft revision before first publication", async () => {
    const tx = {
      worldDefinitionRevision: { findFirst: jest.fn().mockResolvedValue(null) },
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          currentRevisionId: null,
          currentRevision: null,
          draft,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = serviceWith(prisma);
    await expect(
      service.publish("world-1", { expectedStorageRevision: 3 }, "gm-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("freezes authoring when the lineage is archived", async () => {
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ARCHIVED",
          metadataRevision: 2,
          draft,
        }),
      },
    };
    const service = serviceWith(prisma);
    await expect(
      service.validate("world-1", { expectedStorageRevision: 3 }, "gm-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
