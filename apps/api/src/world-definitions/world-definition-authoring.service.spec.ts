import { SaveWorldDraftDto } from "./dto/world-definition-authoring.dto";
import { BadRequestException, ConflictException, ValidationPipe } from "@nestjs/common";
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
      payload: {
        identity: {
          id: "root",
          version: { revision: 1, updatedAt: now.toISOString() },
        },
        name: "Root",
        kind: "world",
        placement: { kind: "root" },
      },
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

const itemImage = {
  assetId: "asset-1",
  altText: "A brass key",
  width: 512,
  height: 512,
  mimeType: "image/png",
};

const itemRequest = {
  expectedStorageRevision: 3,
  name: "Bell Key",
  itemFamilyKey: "aow:item-family-tool",
  category: "tool",
  quality: "standard" as const,
  compatibleEquipmentSlotSets: [],
  image: itemImage,
};

function itemAuthoringHarness(asset?: {
  id: string;
  createdByUserId: string;
  scopeType: string;
  scopeId: string;
  mimeType: string;
}) {
  const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
  const findFirst = jest.fn(
    ({
      where,
    }: {
      where: {
        id: string;
        createdByUserId: string;
        scopeType: string;
        scopeId: string;
      };
    }) =>
      Promise.resolve(
        asset &&
          asset.id === where.id &&
          asset.createdByUserId === where.createdByUserId &&
          asset.scopeType === where.scopeType &&
          asset.scopeId === where.scopeId
          ? { id: asset.id, mimeType: asset.mimeType }
          : null,
      ),
  );
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const worldFindUnique = jest.fn().mockResolvedValue({
    id: "world-1",
    status: "ACTIVE",
    metadataRevision: 1,
    draft,
  });
  const prisma = {
    worldDefinition: {
      findUnique: worldFindUnique,
    },
    worldDefinitionDraft: { updateMany },
    mediaAsset: { findFirst },
  };
  return {
    service: serviceWith(prisma, {
      resolveEffectiveRoots: jest.fn().mockResolvedValue({
        elements: compiled.elements,
        roots: [],
      }),
    }),
    findFirst,
    updateMany,
    worldFindUnique,
  };
}

describe("WorldDefinitionAuthoringService", () => {
  it.each(["world-creature", "world-item", "character-option"])(
    "round-trips recovered snapshot records through strict validation when saving %s",
    async (kind) => {
      const recoveredDraft = {
        ...draft,
        snapshotRecords: draft.snapshotRecords.map((record) => ({
          ...record, sourceRevision: 1, contentHash: "snapshot-only-hash",
        })),
      };
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const service = serviceWith({
        worldDefinition: { findUnique: jest.fn().mockResolvedValue({
          id: "world-1", status: "ACTIVE", draft: recoveredDraft,
        }) },
        worldDefinitionDraft: { updateMany },
      });
      const response = await service.getDraft("world-1", "gm-1");
      expect(response.records[0]).not.toHaveProperty("contentHash");
      expect(response.records[0].sourceRevision).toBe(1);
      expect(response.records[0].payload).toEqual(draft.snapshotRecords[0].payload);
      const record = {
        resourceType: kind === "character-option" ? "definitions" : "world-placements",
        sourceId: "new-record",
        payload: kind === "character-option"
          ? { kind: "skill", name: "Tracking" }
          : { name: "Harbor placement", locationId: "root", source: kind === "world-item"
            ? { kind, itemDefinitionId: "item" } : { kind: "world-creature", creatureId: "guard" } },
      };
      const records = [...response.records, record];
      const content = { ...response.content as object,
        ...(kind === "character-option" ? { definitionIds: [record.sourceId] }
          : { worldPlacementDefinitionIds: [record.sourceId] }),
      };
      const input = await new ValidationPipe({
        whitelist: true, transform: true, forbidNonWhitelisted: true,
      }).transform({
        expectedStorageRevision: response.storageRevision,
        revisionName: response.revisionName, content, records,
      }, { type: "body", metatype: SaveWorldDraftDto }) as SaveWorldDraftDto;
      await service.save("world-1", input, "gm-1");
      expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: draft.id, storageRevision: 3 },
        data: expect.objectContaining({ snapshotRecords: records, content }) as unknown,
      }));
      expect(recoveredDraft.snapshotRecords[0].contentHash).toBe("snapshot-only-hash");
    },
  );

  it.each(["update", "remove", "add"])(
    "rejects a generic whole-draft %s of protected authored records",
    async (operation) => {
      const protectedDraft = {
        ...draft,
        snapshotRecords: [
          ...draft.snapshotRecords,
          {
            resourceType: "creatures",
            sourceId: "legacy-creature",
            payload: { name: "Bell Keeper", worldId: "world-1" },
          },
        ],
      };
      const updateMany = jest.fn();
      const prisma = {
        worldDefinition: {
          findUnique: jest.fn().mockResolvedValue({
            id: "world-1",
            status: "ACTIVE",
            metadataRevision: 1,
            draft: protectedDraft,
          }),
        },
        worldDefinitionDraft: { updateMany },
      };
      const next: Array<{
        resourceType: string;
        sourceId: string;
        payload: unknown;
      }> = [...protectedDraft.snapshotRecords];
      if (operation === "update") {
        next[1] = { ...next[1], payload: { name: "Changed Keeper" } };
      } else if (operation === "remove") {
        next.pop();
      } else {
        next.push({
          resourceType: "definitions",
          sourceId: "injected-item",
          payload: { kind: "item", name: "Injected" },
        });
      }

      await expect(
        serviceWith(prisma).save(
          "world-1",
          {
            expectedStorageRevision: 3,
            revisionName: "Attempted generic mutation",
            content: protectedDraft.content,
            records: next,
          },
          "gm-1",
        ),
      ).rejects.toThrow("dedicated authoring actions");
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it("rejects a generic change to the protected World root", async () => {
    const updateMany = jest.fn();
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
    await expect(
      serviceWith(prisma).save(
        "world-1",
        {
          expectedStorageRevision: 3,
          revisionName: "Changed root",
          content: { ...draft.content, rootLocationId: "other-location" },
          records: draft.snapshotRecords,
        },
        "gm-1",
      ),
    ).rejects.toThrow("World root");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects promoting a visible legacy Item definition through generic membership editing", async () => {
    const legacyItemDraft = {
      ...draft,
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "definitions",
          sourceId: "legacy-item",
          payload: { kind: "item", name: "Recovered brass key" },
        },
      ],
    };
    const updateMany = jest.fn();
    const prisma = {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          metadataRevision: 1,
          draft: legacyItemDraft,
        }),
      },
      worldDefinitionDraft: { updateMany },
    };

    await expect(
      serviceWith(prisma).save(
        "world-1",
        {
          expectedStorageRevision: 3,
          revisionName: "Attempted legacy promotion",
          content: {
            ...legacyItemDraft.content,
            definitionIds: ["legacy-item"],
          },
          records: legacyItemDraft.snapshotRecords,
        },
        "gm-1",
      ),
    ).rejects.toThrow("dedicated library actions");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects unauthorized Item media during validation", async () => {
    const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
    const itemConcept = compiled.elements.find(
      ({ lineage }) => lineage.semanticRole === "aow:item",
    );
    if (!itemConcept) throw new Error("Missing Item concept in test seed.");
    const protectedDraft = {
      ...draft,
      content: { ...draft.content, definitionIds: ["item-1"] },
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "definitions",
          sourceId: "item-1",
          payload: {
            identity: {
              id: "item-1",
              key: "world:item-1",
              name: "Bell Key",
              source: { namespace: "world", edition: "1" },
            },
            kind: "item",
            components: { category: "tool", quality: "standard" },
            image: itemImage,
            conformance: {
              conceptId: itemConcept.lineage.id,
              modelSchemaReleaseIds: [compiled.releaseId],
            },
            modelValues: { "aow:item-family": "aow:item-family-tool" },
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
          draft: protectedDraft,
        }),
      },
      worldDefinitionDraft: { updateMany },
      mediaAsset: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = serviceWith(prisma, {
      resolveEffectiveRoots: jest.fn().mockResolvedValue({
        elements: compiled.elements,
        roots: [],
      }),
    });

    await expect(
      service.validate("world-1", { expectedStorageRevision: 3 }, "gm-1"),
    ).resolves.toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: "item-media-unauthorized" })],
    });
  });

  it("rechecks Item media authorization inside publication", async () => {
    const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
    const itemConcept = compiled.elements.find(
      ({ lineage }) => lineage.semanticRole === "aow:item",
    );
    if (!itemConcept) throw new Error("Missing Item concept in test seed.");
    const publishableDraft = {
      ...draft,
      validationStatus: "VALID",
      validatedStorageRevision: 3,
      content: { ...draft.content, definitionIds: ["item-1"] },
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "definitions",
          sourceId: "item-1",
          payload: {
            identity: {
              id: "item-1",
              key: "world:item-1",
              name: "Bell Key",
              source: { namespace: "world", edition: "1" },
            },
            kind: "item",
            components: { category: "tool", quality: "standard" },
            image: itemImage,
            conformance: {
              conceptId: itemConcept.lineage.id,
              modelSchemaReleaseIds: [compiled.releaseId],
            },
            modelValues: { "aow:item-family": "aow:item-family-tool" },
          },
        },
      ],
    };
    const tx = {
      worldDefinitionRevision: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          currentRevisionId: null,
          currentRevision: null,
          draft: publishableDraft,
        }),
      },
      mediaAsset: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = serviceWith(prisma, {
      resolveEffectiveRoots: jest.fn().mockResolvedValue({
        elements: compiled.elements,
        roots: [],
      }),
    });

    await expect(
      service.publish("world-1", { expectedStorageRevision: 3 }, "gm-1"),
    ).rejects.toThrow("unavailable for this World");
    expect(tx.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: {
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: { startsWith: "image/" },
      },
      select: { id: true },
    });
    expect(tx.worldDefinitionRevision.create).not.toHaveBeenCalled();
  });

  it("atomically upgrades one legacy Creature while preserving its source and references", async () => {
    const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
    const legacyDraft = {
      ...draft,
      content: {
        ...draft.content,
        creatureIds: ["legacy-creature"],
      },
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "creatures",
          sourceId: "legacy-creature",
          sourceRevision: 7,
          payload: {
            name: "Bell Keeper",
            attributes: { standard: { might: { score: 42, modifier: -1 }, will: { score: 67, modifier: 2 } } },
            worldId: "world-1",
            relationships: [{ kind: "guards", targetId: "root" }],
          },
        },
        {
          resourceType: "legacy-links",
          sourceId: "placement-1",
          payload: { creatureId: "legacy-creature", locationId: "root" },
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
          draft: legacyDraft,
        }),
      },
      worldDefinitionDraft: { updateMany },
      mediaAsset: { findFirst: jest.fn().mockResolvedValue({ id: "new-art", mimeType: "image/webp" }) },
    };
    const service = serviceWith(prisma, {
      resolveEffectiveRoots: jest.fn().mockResolvedValue({
        elements: compiled.elements,
        roots: [],
      }),
    });

    await service.upgradeLegacyCreature(
      "world-1",
      "legacy-creature",
      {
        expectedStorageRevision: 3,
        name: "Bell Keeper",
        attributes: { "aow:attribute-might": 42, "aow:attribute-wisdom": 67 },
        equipmentSlots: [],
        images: { overheadToken: { assetId: "new-art", altText: "Keeper overhead", width: 1024, height: 1024, mimeType: "image/webp" } },
        instanceEmbodimentPolicy: { strategy: "one-per-instance" },
        movement: [],
        skillDefinitionIds: [],
        professionDefinitionIds: [],
      },
      "gm-1",
    );

    expect(prisma.mediaAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "new-art", createdByUserId: "gm-1", scopeType: "world-definition", scopeId: "world-1" } }));
    const updateCalls = updateMany.mock.calls as unknown[][];
    const write = updateCalls[0]?.[0] as {
      data: {
        content: { definitionIds: string[]; creatureIds: string[] };
        snapshotRecords: Array<{
          resourceType: string;
          sourceId: string;
          payload: unknown;
        }>;
      };
    };
    expect(write.data.content).toMatchObject({
      definitionIds: ["legacy-creature"],
      creatureIds: [],
    });
    const upgraded = write.data.snapshotRecords.find(
      (record) =>
        record.resourceType === "definitions" &&
        record.sourceId === "legacy-creature",
    );
    expect(upgraded).toBeDefined();
    const upgradedPayload = upgraded?.payload as Record<string, unknown>;
    expect(upgradedPayload.kind).toBe("creature");
    expect(upgradedPayload.components).toMatchObject({
      attributes: { "aow:attribute-might": 42, "aow:attribute-wisdom": 67 },
      art: { images: { overheadToken: { assetId: "new-art" } } },
    });
    const extensions = upgradedPayload.extensions as Record<string, unknown>;
    expect(extensions["aow:legacy-creature"]).toEqual({
      resourceType: "creatures",
      sourceRevision: 7,
      payload: legacyDraft.snapshotRecords[1]?.payload,
    });
    expect(write.data.snapshotRecords).toContainEqual(
      legacyDraft.snapshotRecords[2],
    );
    expect(write.data.snapshotRecords).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: "creatures",
          sourceId: "legacy-creature",
        }),
      ]),
    );

    prisma.mediaAsset.findFirst.mockResolvedValue(null as never);
    await expect(service.upgradeLegacyCreature("world-1", "legacy-creature", {
      expectedStorageRevision: 3, name: "Keeper", attributes: {}, equipmentSlots: [],
      instanceEmbodimentPolicy: { strategy: "one-per-instance" },
      images: { portrait: { assetId: "foreign-art" } },
    }, "gm-1")).rejects.toThrow("Choose an image belonging to this World.");
    expect(updateMany).toHaveBeenCalledTimes(1);

    const upgradedDraft = {
      ...legacyDraft,
      content: write.data.content,
      snapshotRecords: write.data.snapshotRecords,
      storageRevision: 4,
    };
    const validationWrite = jest.fn().mockResolvedValue({ count: 1 });
    const validationService = serviceWith(
      {
        worldDefinition: {
          findUnique: jest.fn().mockResolvedValue({
            id: "world-1",
            status: "ACTIVE",
            metadataRevision: 1,
            draft: upgradedDraft,
          }),
        },
        worldDefinitionDraft: { updateMany: validationWrite },
        mediaAsset: { findFirst: jest.fn() },
      },
      {
        resolveEffectiveRoots: jest.fn().mockResolvedValue({
          elements: compiled.elements,
          roots: [],
        }),
      },
    );
    await expect(
      validationService.validate(
        "world-1",
        { expectedStorageRevision: 4 },
        "gm-1",
      ),
    ).resolves.toEqual({ valid: true, issues: [] });
  });

  it("creates a canonical nested Location through one optimistic draft advance", async () => {
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
    await service.createLocation(
      "world-1",
      {
        expectedStorageRevision: 3,
        name: "Glass Harbor",
        kind: "settlement",
        parentLocationId: "root",
      },
      "gm-1",
    );
    const calls = updateMany.mock.calls as unknown[][];
    const call = calls[0]?.[0] as {
      data: {
        snapshotRecords: Array<{
          sourceId: string;
          payload: Record<string, unknown>;
        }>;
      };
    };
    const created = call.data.snapshotRecords.find(
      (record) => record.sourceId !== "root",
    );
    expect(created?.payload).toMatchObject({
      name: "Glass Harbor",
      kind: "settlement",
      identity: { version: { revision: 1 } },
      placement: { kind: "within-parent", parentLocationId: "root" },
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "draft-1", storageRevision: 3 } }),
    );
  });

  it("accepts an Item image owned by the GM and scoped to the selected World", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });

    await harness.service.createItem("world-1", itemRequest, "gm-1");

    expect(harness.findFirst).toHaveBeenCalledWith({
      where: {
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
      },
      select: { id: true, mimeType: true },
    });
    expect(harness.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "another owner",
      {
        id: "asset-1",
        createdByUserId: "gm-2",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      },
    ],
    [
      "another World",
      {
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-2",
        mimeType: "image/png",
      },
    ],
    ["a missing asset", undefined],
  ])("rejects an Item image belonging to %s", async (_label, asset) => {
    const harness = itemAuthoringHarness(asset);

    await expect(
      harness.service.createItem("world-1", itemRequest, "gm-1"),
    ).rejects.toThrow("unavailable for this World");
    expect(harness.updateMany).not.toHaveBeenCalled();
  });

  it("retains an existing captured Item image without requiring a live media row", async () => {
    const existingDraft = {
      ...draft,
      content: { ...draft.content, definitionIds: ["item-1"] },
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "definitions",
          sourceId: "item-1",
          payload: {
            identity: {
              id: "item-1",
              key: "world:item-1",
              name: "Old Key",
              source: { namespace: "world", edition: "1" },
            },
            kind: "item",
            components: { category: "tool", quality: "standard" },
            image: itemImage,
            conformance: {
              conceptId: "old-concept",
              modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
            },
            modelValues: { "aow:item-family": "aow:item-family-tool" },
          },
        },
      ],
    };
    const harness = itemAuthoringHarness();
    harness.worldFindUnique.mockResolvedValue({
      id: "world-1",
      status: "ACTIVE",
      metadataRevision: 1,
      draft: existingDraft,
    });

    await harness.service.updateItem(
      "world-1",
      "item-1",
      { ...itemRequest, name: "New Key" },
      "gm-1",
    );

    expect(harness.findFirst).not.toHaveBeenCalled();
    expect(harness.updateMany).toHaveBeenCalledTimes(1);
  });

  it("captures the exact legacy Item payload and source revision during canonical edit", async () => {
    const legacyPayload = {
      kind: "item",
      name: "Recovered brass key",
      description: "An exact legacy description.",
      category: "loot",
      image: itemImage,
      relationships: [{ kind: "opens", targetId: "vault-door" }],
      unknownLegacyField: { preserve: true },
    };
    const legacyDraft = {
      ...draft,
      content: { ...draft.content, definitionIds: ["item-1"] },
      snapshotRecords: [
        ...draft.snapshotRecords,
        {
          resourceType: "definitions",
          sourceId: "item-1",
          sourceRevision: 12,
          payload: legacyPayload,
        },
      ],
    };
    const harness = itemAuthoringHarness();
    harness.worldFindUnique.mockResolvedValue({
      id: "world-1",
      status: "ACTIVE",
      metadataRevision: 1,
      draft: legacyDraft,
    });

    await harness.service.updateItem(
      "world-1",
      "item-1",
      { ...itemRequest, name: "Canonical brass key" },
      "gm-1",
    );

    const calls = harness.updateMany.mock.calls as unknown[][];
    const write = calls[0]?.[0] as {
      data: {
        snapshotRecords: Array<{
          resourceType: string;
          sourceId: string;
          payload: Record<string, unknown>;
        }>;
      };
    };
    const upgraded = write.data.snapshotRecords.find(
      (record) =>
        record.resourceType === "definitions" && record.sourceId === "item-1",
    );
    expect(upgraded?.payload).toMatchObject({
      kind: "item",
      identity: { id: "item-1", name: "Canonical brass key" },
      extensions: {
        "aow:legacy-item": {
          resourceType: "definitions",
          sourceRevision: 12,
          payload: legacyPayload,
        },
      },
    });
    expect(harness.findFirst).not.toHaveBeenCalled();
  });

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
    await service.create(
      {
        name: "Glasswake",
        content: { definitionIds: ["caller-item"] },
        records: [
          {
            resourceType: "definitions",
            sourceId: "caller-item",
            payload: { kind: "item" },
          },
        ],
      } as never,
      "gm-1",
    );
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
    expect(createInput.content).not.toHaveProperty("definitionIds", [
      "caller-item",
    ]);
    expect(createInput.snapshotRecords).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "caller-item" }),
      ]),
    );
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

describe("Location section persistence", () => {
  it("saves public/private prose, discoveries, and an authorized map through the Location command", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: "map", mimeType: "image/webp" });
    const service = serviceWith({
      worldDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "world-1", status: "ACTIVE", draft }),
      },
      worldDefinitionDraft: { updateMany },
      mediaAsset: { findFirst },
    });
    const image = {
      assetId: "map",
      altText: "Map of Earth",
      width: 1536,
      height: 1024,
      mimeType: "image/webp",
      orientation: "scenic",
    };
    await service.updateLocation(
      "world-1",
      "root",
      {
        expectedStorageRevision: 3,
        name: "Earth",
        kind: "world",
        description: "Public prose",
        gmDescription: "Private prose",
        discoveries: [
          { id: "claim", kind: "truth", statement: "Hidden passage" },
        ],
        image,
      },
      "gm-1",
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "map",
        OR: [{ createdByUserId: "gm-1" }, { createdByUserId: null }],
        mimeType: { startsWith: "image/" },
      },
    });
    expect(
      (
        (updateMany.mock.calls as unknown[][])[0][0] as {
          data: { snapshotRecords: Array<{ payload: unknown }> };
        }
      ).data.snapshotRecords[0].payload,
    ).toMatchObject({
      description: "Public prose",
      gmDescription: "Private prose",
      discoveries: [{ kind: "truth", statement: "Hidden passage" }],
      image,
      identity: { version: { revision: 2 } },
    });
  });
  it("rejects an unavailable map before advancing the draft", async () => {
    const updateMany = jest.fn();
    const service = serviceWith({
      worldDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "world-1", status: "ACTIVE", draft }),
      },
      worldDefinitionDraft: { updateMany },
      mediaAsset: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateLocation(
        "world-1",
        "root",
        {
          expectedStorageRevision: 3,
          name: "Earth",
          kind: "world",
          image: { assetId: "foreign" },
        },
        "gm-1",
      ),
    ).rejects.toThrow("selected Location image is unavailable");
    expect(updateMany).not.toHaveBeenCalled();
  });
});
