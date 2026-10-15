import { worldAccessWhere } from "./world-access";
import { SaveWorldDraftDto } from "./dto/world-definition-authoring.dto";
import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from "@nestjs/common";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import {
  assertGovernedRecordConformance,
  WorldDefinitionAuthoringService,
} from "./world-definition-authoring.service";

const blankMap = {
  kind: "isometric" as const,
  formatVersion: 1 as const,
  dimensions: { x: 16, y: 16, z: 8 },
  cellSize: { value: 5 as const, unit: "ft" as const },
  chunkSize: 16 as const,
  materials: [
    {
      key: "terrain:grass" as const,
      revision: 1,
      name: "Grass",
      terrainType: "terrain:grass" as const,
    },
  ],
  chunks: [],
};

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
        map: blankMap,
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
          ...record,
          sourceRevision: 1,
          contentHash: "snapshot-only-hash",
        })),
      };
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const service = serviceWith({
        worldDefinition: {
          findUnique: jest.fn().mockResolvedValue({
            id: "world-1",
            status: "ACTIVE",
            draft: recoveredDraft,
          }),
        },
        worldDefinitionDraft: { updateMany },
      });
      const response = await service.getDraft("world-1", "gm-1");
      expect(response.records[0]).not.toHaveProperty("contentHash");
      expect(response.records[0].sourceRevision).toBe(1);
      expect(response.records[0].payload).toEqual(
        draft.snapshotRecords[0].payload,
      );
      const record = {
        resourceType:
          kind === "character-option" ? "definitions" : "world-placements",
        sourceId: "new-record",
        payload:
          kind === "character-option"
            ? { kind: "skill", name: "Tracking" }
            : {
                name: "Harbor placement",
                locationId: "root",
                source:
                  kind === "world-item"
                    ? { kind, itemDefinitionId: "item" }
                    : { kind: "world-creature", creatureId: "guard" },
              },
      };
      const records = [...response.records, record];
      const content = {
        ...(response.content as object),
        ...(kind === "character-option"
          ? { definitionIds: [record.sourceId] }
          : { worldPlacementDefinitionIds: [record.sourceId] }),
      };
      const input = (await new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }).transform(
        {
          expectedStorageRevision: response.storageRevision,
          revisionName: response.revisionName,
          content,
          records,
        },
        { type: "body", metatype: SaveWorldDraftDto },
      )) as SaveWorldDraftDto;
      await service.save("world-1", input, "gm-1");
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: draft.id,
            storageRevision: 3,
            worldDefinition: {
              status: "ACTIVE",
              ...worldAccessWhere("gm-1", true),
            },
          },
          data: expect.objectContaining({
            snapshotRecords: records,
            content,
          }) as unknown,
        }),
      );
      expect(recoveredDraft.snapshotRecords[0].contentHash).toBe(
        "snapshot-only-hash",
      );
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
            attributes: {
              standard: {
                might: { score: 42, modifier: -1 },
                will: { score: 67, modifier: 2 },
              },
            },
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
      mediaAsset: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "new-art", mimeType: "image/webp" }),
      },
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
        images: {
          overheadToken: {
            assetId: "new-art",
            altText: "Keeper overhead",
            width: 1024,
            height: 1024,
            mimeType: "image/webp",
          },
        },
        instanceEmbodimentPolicy: { strategy: "one-per-instance" },
        movement: [],
        skillDefinitionIds: [],
        professionDefinitionIds: [],
      },
      "gm-1",
    );

    expect(prisma.mediaAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "new-art",
          scopeType: "world-definition",
          scopeId: "world-1",
        },
      }),
    );
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
    await expect(
      service.upgradeLegacyCreature(
        "world-1",
        "legacy-creature",
        {
          expectedStorageRevision: 3,
          name: "Keeper",
          attributes: {},
          equipmentSlots: [],
          instanceEmbodimentPolicy: { strategy: "one-per-instance" },
          images: { portrait: { assetId: "foreign-art" } },
        },
        "gm-1",
      ),
    ).rejects.toThrow("Choose an image belonging to this World.");
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

  it("rejects mapless Location creation before advancing the draft", async () => {
    const updateMany = jest.fn();
    const service = serviceWith({
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          metadataRevision: 1,
          draft,
        }),
      },
      worldDefinitionDraft: { updateMany },
    });
    await expect(
      service.createLocation(
        "world-1",
        {
          expectedStorageRevision: 3,
          name: "Unmapped harbor",
          kind: "settlement",
          parentLocationId: "root",
        },
        "gm-1",
      ),
    ).rejects.toThrow("requires an image map or an isometric terrain map");
    expect(updateMany).not.toHaveBeenCalled();
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
        map: blankMap,
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
      expect.objectContaining({
        where: {
          id: "draft-1",
          storageRevision: 3,
          worldDefinition: {
            status: "ACTIVE",
            ...worldAccessWhere("gm-1", true),
          },
        },
      }),
    );
  });

  it.each([
    { traits: [{ kind: "trait", components: { actions: "invalid" } }] },
    {
      actions: [
        { kind: "action", components: { activation: "invalid", outcomes: [] } },
      ],
    },
    {
      vehicle: {
        vehicleType: "land",
        size: "large",
        armorClass: "invalid",
        hitPoints: 20,
        speeds: {},
      },
    },
  ])(
    "rejects malformed explicitly supplied Item content: %j",
    async (content) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      await expect(
        harness.service.createItem(
          "world-1",
          { ...itemRequest, ...content } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    { kind: "narrative", text: "Bell rings", visibility: "secret" },
    {
      kind: "damage",
      target: "target",
      damageType: "steam",
      amount: { terms: [{ kind: "constant", value: "bad" }] },
    },
    { kind: "heal", target: "self", amount: { terms: [] }, upToMaximum: "yes" },
    { kind: "move", target: "self", distance: { value: 5, unit: "league" } },
  ])(
    "rejects malformed Action effect fields before an Item write: %j",
    async (effect) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      await expect(
        harness.service.createItem(
          "world-1",
          {
            ...itemRequest,
            actions: [
              {
                kind: "action",
                components: {
                  activation: "action",
                  outcomes: [{ id: "hit", effects: [effect] }],
                },
              },
            ],
          } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(["direct", "trait", "vehicle"])(
    "rejects malformed %s Action cost fields before an Item write",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const action = {
        kind: "action",
        components: {
          activation: "action",
          outcomes: [],
          costs: [
            {
              kind: "resource",
              cost: {
                resource: "steam",
                amount: { kind: "constant", value: "bad" },
              },
            },
          ],
        },
      };
      const content =
        owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      await expect(
        harness.service.createItem(
          "world-1",
          {
            ...itemRequest,
            ...content,
          } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(["direct", "trait", "vehicle", "trait-owned"])(
    "validates %s choices before writes while allowing incomplete draft fields",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (choice: unknown) => {
        const action = {
          kind: "action",
          components: { activation: "action", outcomes: [], choices: [choice] },
        };
        return owner === "trait-owned"
          ? { traits: [{ kind: "trait", components: { choices: [choice] } }] }
          : owner === "direct"
            ? { actions: [action] }
            : owner === "trait"
              ? {
                  traits: [
                    { kind: "trait", components: { actions: [action] } },
                  ],
                }
              : { vehicle: { actions: [action] } };
      };
      const base = { id: "choice", prompt: "Choose", minimum: 0, maximum: 1 };
      for (const choice of [
        { ...base, maximum: "bad" },
        { ...base, options: [{ id: "option", label: false, value: null }] },
        {
          ...base,
          options: [
            {
              id: "option",
              label: "Option",
              value: null,
              prerequisites: [
                {
                  kind: "not",
                  predicate: { kind: "has-definition", subject: false },
                },
              ],
            },
          ],
        },
      ]) {
        await expect(
          harness.service.createItem(
            "world-1",
            { ...itemRequest, ...wrap(choice) } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      await harness.service.createItem(
        "world-1",
        {
          ...itemRequest,
          ...wrap({
            id: "choice",
            options: [{ id: "option", private: { preserve: true } }],
          }),
        } as never,
        "gm-1",
      );
      expect(harness.updateMany).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(harness.updateMany.mock.calls[0][0])).toContain(
        '"private":{"preserve":true}',
      );
    },
  );

  it.each(["direct", "trait", "vehicle"])(
    "validates %s Action prerequisites before writes while allowing incomplete drafts",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (prerequisites: unknown) => {
        const action = {
          kind: "action",
          components: { activation: "action", outcomes: [], prerequisites },
        };
        return owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      };
      for (const prerequisite of [
        { kind: "has-condition", subject: false, condition: "world:custom" },
        {
          kind: "within-distance",
          source: "",
          target: "",
          distance: { value: 3, unit: "league" },
        },
        { kind: "is-attuned", subject: "", item: null },
      ]) {
        await expect(
          harness.service.createItem(
            "world-1",
            { ...itemRequest, ...wrap([prerequisite]) } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      const prerequisites = [
        { kind: "has-tag", private: { preserve: true } },
        { kind: "within-distance", source: "", target: "", distance: {} },
        { kind: "all", private: { preserve: true } },
      ];
      await harness.service.createItem(
        "world-1",
        { ...itemRequest, ...wrap(prerequisites) } as never,
        "gm-1",
      );
      expect(harness.updateMany).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(harness.updateMany.mock.calls[0][0])).toContain(
        JSON.stringify(prerequisites),
      );
    },
  );

  it("validates Trait trigger metadata and effects before writes while preserving incomplete and advanced drafts", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });
    const wrap = (triggers: unknown) => ({
      traits: [
        {
          kind: "trait",
          private: true,
          components: {
            triggers,
            grants: ["unknown"],
            actions: [],
            choices: [],
            private: { preserved: true },
          },
        },
        { kind: "trait", components: {} },
      ],
    });
    for (const triggers of [
      false,
      [false],
      [{ event: "unknown", effects: [] }],
      [{ event: "hit", effects: [], optional: "yes" }],
      [{ event: "hit", effects: [{ kind: "damage", target: false }] }],
    ]) {
      await expect(
        harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap(triggers) } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    }
    for (const triggers of [
      [],
      [{}],
      [{ event: "hit", effects: [{ kind: "damage" }] }],
      [
        {
          event: "custom",
          customEvent: "test:hit",
          priority: -0.5,
          effects: [{ kind: "future", private: true }],
          predicate: { kind: "custom", private: true },
          limit: { kind: "uses", maximum: { kind: "future" } },
        },
      ],
    ]) {
      const patch = wrap(triggers);
      await harness.service.createItem(
        "world-1",
        { ...itemRequest, ...patch } as never,
        "gm-1",
      );
      expect(
        JSON.stringify(harness.updateMany.mock.calls.at(-1)?.[0]),
      ).toContain(JSON.stringify(patch.traits));
    }
    expect(harness.updateMany).toHaveBeenCalledTimes(4);
  });

  it.each(["direct", "trait", "vehicle"] as const)(
    "validates %s Action usage limits before writes and preserves incomplete and opaque drafts",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (limit: unknown) => {
        const actions = [
          {
            kind: "action",
            components: {
              activation: "action",
              outcomes: [],
              prerequisites: [{ kind: "always" }],
              private: true,
              ...(limit === undefined ? {} : { limit }),
            },
          },
        ];
        return owner === "direct"
          ? { actions }
          : owner === "trait"
            ? {
                traits: [
                  {
                    kind: "trait",
                    components: { actions, grants: ["unknown"], private: true },
                  },
                ],
              }
            : { vehicle: { actions, private: true } };
      };
      for (const limit of [
        false,
        { kind: "uses", maximum: { kind: "literal", value: 2 } },
        { kind: "uses", maximum: { kind: "path", path: "", fallback: false } },
        { kind: "recharge", die: 6, succeedsOn: ["2"] },
        { kind: "resource", resource: 1 },
      ]) {
        await expect(
          harness.service.createItem(
            "world-1",
            { ...itemRequest, ...wrap(limit) } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      for (const limit of [
        undefined,
        {},
        { kind: "uses" },
        { kind: "uses", maximum: {} },
        { kind: "uses", maximum: { kind: "future", private: true } },
        { kind: "recharge", die: -2.5, succeedsOn: [0, 0] },
        { kind: "once-per-turn" },
      ]) {
        const patch = wrap(limit);
        await harness.service.createItem(
          "world-1",
          { ...itemRequest, ...patch } as never,
          "gm-1",
        );
        for (const value of Object.values(patch))
          expect(
            JSON.stringify(harness.updateMany.mock.calls.at(-1)?.[0]),
          ).toContain(JSON.stringify(value));
      }
      expect(harness.updateMany).toHaveBeenCalledTimes(7);
    },
  );

  it("validates Trait usage limits before writes and preserves incomplete and opaque drafts", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });
    const wrap = (limit: unknown) => ({
      traits: [
        {
          kind: "trait",
          components: {
            triggers: [
              {
                event: "hit",
                effects: [],
                predicate: { kind: "always" },
                private: true,
                ...(limit === undefined ? {} : { limit }),
              },
            ],
            actions: [],
            grants: ["unknown"],
            private: true,
          },
        },
      ],
    });
    for (const limit of [
      false,
      { kind: "uses", maximum: { kind: "literal", value: 2 } },
      { kind: "uses", maximum: { kind: "path", path: "", fallback: false } },
      { kind: "recharge", die: 6, succeedsOn: ["2"] },
      { kind: "resource", resource: 1 },
    ]) {
      await expect(
        harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap(limit) } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    }
    for (const limit of [
      undefined,
      { kind: "uses" },
      { kind: "uses", maximum: { kind: "future", private: true } },
      { kind: "recharge", die: -2.5, succeedsOn: [0, 0] },
      { kind: "once-per-turn" },
    ]) {
      const patch = wrap(limit);
      await harness.service.createItem(
        "world-1",
        { ...itemRequest, ...patch } as never,
        "gm-1",
      );
      expect(
        JSON.stringify(harness.updateMany.mock.calls.at(-1)?.[0]),
      ).toContain(JSON.stringify(patch.traits));
    }
    expect(harness.updateMany).toHaveBeenCalledTimes(5);
  });

  it("validates recursive Trait trigger predicates before writes and preserves omitted and opaque rules", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });
    const wrap = (predicate: unknown) => ({
      traits: [
        {
          kind: "trait",
          components: {
            triggers: [
              {
                event: "hit",
                effects: [],
                ...(predicate === undefined ? {} : { predicate }),
                limit: {
                  kind: "uses",
                  maximum: { kind: "future", private: true },
                },
                private: { retained: true },
              },
            ],
            actions: [],
            grants: ["unknown"],
            private: true,
          },
        },
      ],
    });
    for (const predicate of [
      false,
      {
        kind: "all",
        predicates: [
          { kind: "not", predicate: { kind: "has-tag", subject: false } },
        ],
      },
      {
        kind: "compare",
        operator: "eq",
        left: { kind: "constant", value: "2" },
      },
    ]) {
      await expect(
        harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap(predicate) } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    }
    for (const predicate of [
      undefined,
      { kind: "not" },
      {
        kind: "all",
        predicates: [
          { kind: "has-definition", subject: "self", definitionId: "unknown" },
          { kind: "custom", private: true },
          {
            kind: "compare",
            operator: "eq",
            left: { kind: "future", private: true },
            right: { kind: "literal", value: { nested: true } },
          },
        ],
      },
    ]) {
      const patch = wrap(predicate);
      await harness.service.createItem(
        "world-1",
        { ...itemRequest, ...patch } as never,
        "gm-1",
      );
      expect(
        JSON.stringify(harness.updateMany.mock.calls.at(-1)?.[0]),
      ).toContain(JSON.stringify(patch.traits));
    }
    expect(harness.updateMany).toHaveBeenCalledTimes(3);
  });

  it("validates Trait definition grants before Item writes and preserves optional and imported references", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });
    const wrap = (grants: unknown) => ({
      traits: [
        {
          kind: "trait",
          identity: { id: "trait-1", name: "Gift" },
          private: { keep: true },
          components: {
            ...(grants === undefined ? {} : { grants }),
            grantedConditions: [],
            prerequisites: [{ kind: "always" }],
            actions: [],
            choices: [],
            private: { nested: [false, null] },
          },
        },
        { kind: "trait", components: { grants: ["sibling"] } },
      ],
    });
    for (const grants of [
      null,
      "definition",
      {},
      [null],
      [false],
      [1],
      [{ definitionId: "definition" }],
    ]) {
      await expect(
        harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap(grants) } as never,
          "gm-1",
        ),
      ).rejects.toThrow("Provide a valid Trait grants value.");
      expect(harness.updateMany).not.toHaveBeenCalled();
    }
    for (const grants of [
      undefined,
      [],
      ["", "unknown", "unknown", "definition/with/slash"],
    ]) {
      const patch = wrap(grants);
      await harness.service.createItem(
        "world-1",
        { ...itemRequest, ...patch } as never,
        "gm-1",
      );
      const call = harness.updateMany.mock.calls.at(-1);
      expect(JSON.stringify(call?.[0])).toContain(JSON.stringify(patch.traits));
    }
    expect(harness.updateMany).toHaveBeenCalledTimes(3);
  });

  it("validates Trait modifiers before Item writes and preserves incomplete and advanced rules", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });
    const wrap = (modifiers: unknown) => ({
      traits: [
        {
          kind: "trait",
          private: { keep: true },
          components: {
            modifiers,
            choices: [],
            actions: [],
            prerequisites: [{ kind: "always" }],
          },
        },
      ],
    });
    const base = { id: "m", target: "actor.health", operation: "add" };
    for (const modifier of [
      { ...base, predicate: false },
      {
        ...base,
        predicate: {
          kind: "not",
          predicate: { kind: "has-tag", subject: false },
        },
      },
      {
        ...base,
        predicate: {
          kind: "all",
          predicates: [
            {
              kind: "compare",
              operator: "eq",
              left: { kind: "constant", value: "bad" },
            },
          ],
        },
      },
      { ...base, operation: "bad" },
      { ...base, priority: "1" },
      { ...base, stacking: false },
      { ...base, target: null },
      { ...base, sourceLabel: 3 },
      { ...base, value: { kind: "constant", value: "2" } },
      { ...base, value: { kind: "path", path: "", fallback: false } },
    ]) {
      await expect(
        harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap([modifier]) } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    }
    const patch = wrap([
      {},
      base,
      { ...base, predicate: { kind: "not" } },
      {
        ...base,
        predicate: {
          kind: "all",
          predicates: [{ kind: "has-tag", subject: "" }],
        },
      },
      {
        ...base,
        priority: -1.5,
        value: { kind: "future-expression", private: true },
        predicate: { kind: "custom", private: true },
        private: { keep: true },
      },
      { ...base, value: { kind: "literal", value: { nested: [null, false] } } },
    ]);
    await harness.service.createItem(
      "world-1",
      { ...itemRequest, ...patch } as never,
      "gm-1",
    );
    expect(harness.updateMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(harness.updateMany.mock.calls[0][0])).toContain(
      JSON.stringify(patch.traits),
    );
  });

  it("validates Trait prerequisites recursively before Item writes and preserves unresolved drafts", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });
    const wrap = (prerequisites: unknown) => ({
      traits: [
        {
          kind: "trait",
          private: { secret: true },
          components: {
            prerequisites,
            actions: [],
            choices: [{ private: true }],
          },
        },
      ],
    });
    for (const predicate of [
      { kind: "has-tag", subject: false },
      { kind: "has-definition", subject: "", definitionId: null },
      {
        kind: "compare",
        operator: "eq",
        left: { kind: "constant", value: "2" },
        right: { kind: "literal", value: null },
      },
      { kind: "not", predicate: false },
    ]) {
      await expect(
        harness.service.createItem(
          "world-1",
          {
            ...itemRequest,
            ...wrap([
              {
                kind: "all",
                predicates: [{ kind: "any", predicates: [predicate] }],
              },
            ]),
          } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
    }
    const prerequisites = [
      {
        kind: "all",
        predicates: [
          { kind: "not", predicate: { kind: "has-definition", subject: "" } },
        ],
      },
      {
        kind: "compare",
        operator: "eq",
        left: { kind: "path", path: "" },
        right: { kind: "future-expression", secret: true },
      },
      { kind: "custom", payload: { private: true } },
    ];
    const patch = wrap(prerequisites);
    await harness.service.createItem(
      "world-1",
      { ...itemRequest, ...patch } as never,
      "gm-1",
    );
    expect(harness.updateMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(harness.updateMany.mock.calls[0][0])).toContain(
      JSON.stringify(patch.traits),
    );
  });

  it.each(["direct", "trait", "vehicle"])(
    "validates %s Choice Option prerequisites recursively and preserves incomplete drafts",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (prerequisites?: unknown) => {
        const option = {
          id: "option",
          label: "Option",
          value: { nested: [null, false, { preserve: true }] },
          private: { keep: true },
          ...(prerequisites === undefined ? {} : { prerequisites }),
        };
        const action = {
          kind: "action",
          components: {
            activation: "action",
            outcomes: [],
            choices: [
              {
                id: "choice",
                prompt: "Pick",
                minimum: 0,
                maximum: 1,
                options: [
                  option,
                  { id: "sibling", label: "Sibling", value: null },
                ],
              },
            ],
          },
        };
        return owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      };
      const nest = (predicate: unknown) => [
        {
          kind: "all",
          predicates: [
            { kind: "any", predicates: [{ kind: "not", predicate }] },
          ],
        },
      ];
      for (const prerequisites of [
        false,
        [null],
        nest({ kind: "has-tag", subject: 1, tag: "ready" }),
        nest({ kind: "has-definition", subject: "actor", definitionId: false }),
        nest({
          kind: "compare",
          operator: "eq",
          left: { kind: "constant", value: "bad" },
          right: { kind: "literal", value: null },
        }),
        nest({ kind: "any", predicates: false }),
      ]) {
        await expect(
          harness.service.createItem(
            "world-1",
            { ...itemRequest, ...wrap(prerequisites) } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      for (const prerequisites of [
        undefined,
        [],
        nest({ kind: "has-tag" }),
        nest({ kind: "has-definition", subject: "actor" }),
        nest({ kind: "compare", operator: "eq" }),
        nest({
          kind: "has-definition",
          subject: "",
          definitionId: "unknown-imported",
          private: { keep: true },
        }),
        nest({
          kind: "custom",
          key: "world:future",
          payload: { preserve: true },
        }),
      ]) {
        const patch = wrap(prerequisites);
        await harness.service.createItem(
          "world-1",
          { ...itemRequest, ...patch } as never,
          "gm-1",
        );
        const written = JSON.stringify(
          harness.updateMany.mock.calls.at(-1)?.[0],
        );
        expect(written).toContain(
          JSON.stringify({ nested: [null, false, { preserve: true }] }),
        );
        expect(written).toContain(
          JSON.stringify({ id: "sibling", label: "Sibling", value: null }),
        );
        expect(written).toContain('"private":{"keep":true}');
        if (prerequisites !== undefined)
          expect(written).toContain(JSON.stringify(prerequisites));
      }
      expect(harness.updateMany).toHaveBeenCalledTimes(7);
    },
  );

  it.each(["direct", "trait", "vehicle", "trigger"])(
    "validates recursive built-in rules for %s owners before persistence",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (value: unknown) => {
        const effects = [
          {
            kind: "for-each",
            collection: { kind: "literal", value: [] },
            bindAs: "entry",
            effects: [
              {
                kind: "branch",
                predicate: { kind: "always" },
                whenTrue: [
                  {
                    kind: "temporary-hit-points",
                    target: "entry",
                    amount: {
                      kind: "lookup",
                      table: "table",
                      key: {
                        kind: "arithmetic",
                        operator: "add",
                        operands: [
                          {
                            kind: "constant",
                            ...(value === undefined ? {} : { value }),
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];
        const action = {
          kind: "action",
          components: {
            activation: "action",
            outcomes: [{ id: "outcome", effects, private: { keep: true } }],
          },
        };
        if (owner === "trigger")
          return {
            traits: [
              {
                kind: "trait",
                components: {
                  triggers: [
                    { event: "hit", effects, private: { keep: true } },
                  ],
                },
              },
            ],
          };
        return owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      };
      await expect(
        harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap("bad") } as never,
          "gm-1",
        ),
      ).rejects.toThrow();
      expect(harness.updateMany).not.toHaveBeenCalled();
      for (const value of [undefined, -0.5]) {
        await harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap(value) } as never,
          "gm-1",
        );
        const written = JSON.stringify(
          harness.updateMany.mock.calls.at(-1)?.[0],
        );
        expect(written).toContain('"private":{"keep":true}');
        expect(written).toContain(JSON.stringify(wrap(value)).slice(1, -1));
      }
      expect(harness.updateMany).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["direct", "trait", "vehicle"])(
    "validates %s Action Outcome predicates recursively while preserving incomplete and imported rules",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (when: unknown) => {
        const action = {
          kind: "action",
          components: {
            activation: "action",
            outcomes: [
              {
                id: "outcome",
                effects: [],
                ...(when === undefined ? {} : { when }),
                private: { keep: true },
              },
              { id: "sibling", effects: [] },
            ],
          },
        };
        return owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      };
      const nest = (predicate: unknown) => ({
        kind: "all",
        predicates: [{ kind: "any", predicates: [{ kind: "not", predicate }] }],
      });
      for (const when of [
        false,
        null,
        nest({ kind: "has-tag", subject: 1 }),
        nest({
          kind: "compare",
          operator: "eq",
          left: { kind: "constant", value: "bad" },
          right: { kind: "literal", value: null },
        }),
        nest({ kind: "all", predicates: false }),
        nest({ kind: "has-definition", subject: "actor", definitionId: false }),
      ]) {
        await expect(
          harness.service.createItem(
            "world-1",
            { ...itemRequest, ...wrap(when) } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      for (const when of [
        undefined,
        nest({ kind: "has-tag" }),
        nest({ kind: "compare", operator: "eq" }),
        nest({
          kind: "has-definition",
          subject: "actor",
          definitionId: "imported-unresolved-reference",
        }),
        nest({
          kind: "homebrew:future",
          predicate: false,
          private: { keep: true },
        }),
      ]) {
        await harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap(when) } as never,
          "gm-1",
        );
        const written = JSON.stringify(
          harness.updateMany.mock.calls.at(-1)?.[0],
        );
        expect(written).toContain('"private":{"keep":true}');
        expect(written).toContain('"id":"sibling","effects":[]');
        if (when !== undefined) expect(written).toContain(JSON.stringify(when));
      }
      expect(harness.updateMany).toHaveBeenCalledTimes(5);
    },
  );

  it.each(["direct", "trait", "vehicle"])(
    "validates nested %s Action definition references while preserving unresolved and imported references",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (predicate: unknown) => {
        const action = {
          kind: "action",
          components: {
            activation: "action",
            outcomes: [],
            prerequisites: [
              {
                kind: "all",
                predicates: [
                  { kind: "any", predicates: [{ kind: "not", predicate }] },
                ],
              },
            ],
          },
        };
        return owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      };
      for (const fields of [
        { subject: false },
        { definitionId: 2 },
        { definitionId: null },
        { definitionId: {} },
      ]) {
        const predicate = {
          kind: "has-definition",
          subject: "actor",
          definitionId: "unknown-imported",
          ...fields,
        };
        await expect(
          harness.service.createItem(
            "world-1",
            { ...itemRequest, ...wrap(predicate) } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      for (const predicate of [
        { kind: "has-definition", private: { keep: true } },
        {
          kind: "has-definition",
          subject: "actor",
          definitionId: "unknown-imported",
          private: { keep: true },
        },
        { kind: "has-definition", subject: "", definitionId: "" },
      ]) {
        await harness.service.createItem(
          "world-1",
          { ...itemRequest, ...wrap(predicate) } as never,
          "gm-1",
        );
        expect(
          JSON.stringify(harness.updateMany.mock.calls.at(-1)?.[0]),
        ).toContain(JSON.stringify(predicate));
      }
      expect(harness.updateMany).toHaveBeenCalledTimes(3);
    },
  );

  it.each(["direct", "trait", "vehicle"])(
    "validates nested %s Action comparisons before writes while preserving incomplete operands",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (predicate: unknown) => {
        const action = {
          kind: "action",
          components: {
            activation: "action",
            outcomes: [],
            prerequisites: [
              {
                kind: "all",
                predicates: [
                  { kind: "any", predicates: [{ kind: "not", predicate }] },
                ],
              },
            ],
          },
        };
        return owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      };
      for (const fields of [
        { operator: "unknown" },
        { left: null },
        { left: { kind: "constant", value: "2" } },
        { right: { kind: "path", path: "actor.hp", fallback: false } },
        { right: { kind: "event-value", path: false } },
        { right: { kind: "collection-count", path: [] } },
      ]) {
        const predicate = {
          kind: "compare",
          operator: "eq",
          left: { kind: "constant", value: 1 },
          right: { kind: "literal", value: null },
          ...fields,
        };
        await expect(
          harness.service.createItem(
            "world-1",
            { ...itemRequest, ...wrap(predicate) } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      const predicate = {
        kind: "compare",
        left: { kind: "constant" },
        right: { kind: "literal" },
        private: { keep: true },
      };
      await harness.service.createItem(
        "world-1",
        { ...itemRequest, ...wrap(predicate) } as never,
        "gm-1",
      );
      expect(harness.updateMany).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(harness.updateMany.mock.calls[0][0])).toContain(
        JSON.stringify(predicate),
      );
    },
  );

  it.each(["direct", "trait", "vehicle"])(
    "validates nested %s Action compound prerequisites and preserves unresolved descendants",
    async (owner) => {
      const harness = itemAuthoringHarness({
        id: "asset-1",
        createdByUserId: "gm-1",
        scopeType: "world-definition",
        scopeId: "world-1",
        mimeType: "image/png",
      });
      const wrap = (predicate: unknown) => {
        const action = {
          kind: "action",
          components: {
            activation: "action",
            outcomes: [],
            prerequisites: [
              {
                kind: "all",
                predicates: [
                  { kind: "any", predicates: [{ kind: "not", predicate }] },
                ],
              },
            ],
          },
        };
        return owner === "direct"
          ? { actions: [action] }
          : owner === "trait"
            ? { traits: [{ kind: "trait", components: { actions: [action] } }] }
            : { vehicle: { actions: [action] } };
      };
      for (const predicate of [
        { kind: "has-tag", subject: false },
        { kind: "all", predicates: null },
        { kind: "not", predicate: [] },
        { kind: "any", predicates: [false] },
      ]) {
        await expect(
          harness.service.createItem(
            "world-1",
            {
              ...itemRequest,
              ...wrap(predicate),
            } as never,
            "gm-1",
          ),
        ).rejects.toThrow();
        expect(harness.updateMany).not.toHaveBeenCalled();
      }
      const input = wrap({
        kind: "all",
        private: { keep: true },
        predicates: [
          { kind: "has-tag" },
          { kind: "not" },
          { kind: "any" },
          { kind: "all", predicates: [] },
          { kind: "custom", predicate: false },
        ],
      });
      await harness.service.createItem(
        "world-1",
        { ...itemRequest, ...input } as never,
        "gm-1",
      );
      expect(harness.updateMany).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(harness.updateMany.mock.calls[0][0])).toContain(
        JSON.stringify({
          kind: "all",
          private: { keep: true },
          predicates: [
            { kind: "has-tag" },
            { kind: "not" },
            { kind: "any" },
            { kind: "all", predicates: [] },
            { kind: "custom", predicate: false },
          ],
        }),
      );
    },
  );

  it("saves structured owned Item content and permits unresolved draft information", async () => {
    const harness = itemAuthoringHarness({
      id: "asset-1",
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
      mimeType: "image/png",
    });
    const content = {
      traits: [
        {
          kind: "trait",
          components: {},
          extensions: { "world:private": "Keep" },
        },
      ],
      actions: [
        {
          kind: "action",
          components: {
            activation: "action",
            costs: [
              {
                kind: "resource",
                cost: { resource: "steam", amount: { kind: "constant" } },
              },
            ],
            outcomes: [
              {
                id: "unfinished",
                effects: [
                  {
                    kind: "damage",
                    target: "target",
                    amount: { terms: [{ kind: "dice", size: 6 }] },
                  },
                ],
              },
            ],
          },
        },
      ],
      vehicle: { vehicleType: "land" },
    };
    await harness.service.createItem(
      "world-1",
      { ...itemRequest, ...content } as never,
      "gm-1",
    );
    expect(harness.updateMany).toHaveBeenCalledTimes(1);
    const written = harness.updateMany.mock.calls[0][0];
    expect(JSON.stringify(written)).toContain('"world:private":"Keep"');
    expect(JSON.stringify(written)).toContain('"vehicleType":"land"');
  });

  it("accepts an Item image scoped to the selected World", async () => {
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
        scopeType: "world-definition",
        scopeId: "world-1",
      },
      select: { id: true, mimeType: true },
    });
    expect(harness.updateMany).toHaveBeenCalledTimes(1);
  });

  it("creates a Creature without revalidating an unchanged legacy Item cost", async () => {
    const existingItem = {
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
        components: {
          category: "tool",
          quality: "standard",
          weight: { value: 1, unit: "pound" },
          cost: { value: 50, currency: "credit" },
        },
        image: itemImage,
        conformance: {
          conceptId: "old-concept",
          modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
        },
        modelValues: { "aow:item-family": "aow:item-family-tool" },
      },
    };
    const harness = itemAuthoringHarness();
    harness.worldFindUnique.mockResolvedValue({
      id: "world-1",
      status: "ACTIVE",
      metadataRevision: 1,
      draft: {
        ...draft,
        content: { ...draft.content, definitionIds: [existingItem.sourceId] },
        snapshotRecords: [...draft.snapshotRecords, existingItem],
      },
    });

    await harness.service.createCreature(
      "world-1",
      {
        expectedStorageRevision: 3,
        name: "Bell Keeper",
        attributes: {},
        equipmentSlots: [],
        instanceEmbodimentPolicy: { strategy: "one-per-instance" },
      },
      "gm-1",
    );

    expect(harness.updateMany).toHaveBeenCalledTimes(1);
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
    expect(write.data.snapshotRecords).toContainEqual(existingItem);
    const creature = write.data.snapshotRecords.find(
      (record) => record.payload.kind === "creature",
    );
    expect(creature?.resourceType).toBe("definitions");
    expect(creature?.payload.identity).toMatchObject({ name: "Bell Keeper" });
  });

  it.each([
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
        where: {
          id: "draft-1",
          storageRevision: 3,
          worldDefinition: {
            status: "ACTIVE",
            ...worldAccessWhere("gm-1", true),
          },
        },
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
  it("saves unrelated Location edits while preserving unchanged legacy weather, but rejects changing it to invalid weather", async () => {
    const legacyDraft = {
      ...draft,
      snapshotRecords: [
        {
          ...draft.snapshotRecords[0],
          payload: {
            ...draft.snapshotRecords[0].payload,
            weather: { climate: "foggy" },
          },
        },
      ],
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = serviceWith({
      worldDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: "world-1",
            status: "ACTIVE",
            draft: legacyDraft,
          }),
      },
      worldDefinitionDraft: { updateMany },
    });
    const request = {
      expectedStorageRevision: 3,
      name: "New Root name",
      kind: "world",
    };
    await service.updateLocation("world-1", "root", request, "gm-1");
    await service.updateLocation(
      "world-1",
      "root",
      { ...request, weather: { climate: "foggy" } as never },
      "gm-1",
    );
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshotRecords: expect.arrayContaining([
            expect.objectContaining({
              payload: expect.objectContaining({
                weather: { climate: "foggy" },
              }),
            }),
          ]),
        }),
      }),
    );
    await expect(
      service.updateLocation(
        "world-1",
        "root",
        { ...request, weather: { climate: "changed" } as never },
        "gm-1",
      ),
    ).rejects.toThrow("condition description");
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("persists authored weather and authorized audio cues while rejecting mismatched media and invalid weather", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const media = jest
      .fn()
      .mockResolvedValue({ id: "rain-audio", mimeType: "audio/ogg" });
    const service = serviceWith({
      worldDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "world-1", status: "ACTIVE", draft }),
      },
      worldDefinitionDraft: { updateMany },
      mediaAsset: { findFirst: media },
    });
    const cue = {
      id: "rain",
      name: "Rainfall",
      kind: "audio" as const,
      assetId: "rain-audio" as never,
      enabled: true,
      loop: true,
      volume: 0.4,
      uri: "never-persist",
    };
    const request = {
      expectedStorageRevision: 3,
      name: "Root",
      kind: "world",
      weather: {
        condition: "Rain",
        temperatureCelsius: 8,
        wind: { speedKph: 10 },
      },
      audiovisualEffects: [cue],
    };
    await service.updateLocation("world-1", "root", request, "gm-1");
    const payload = (
      updateMany.mock.calls as unknown as [
        {
          data: {
            snapshotRecords: [
              { payload: { weather: unknown; audiovisualEffects: unknown[] } },
            ];
          };
        },
      ][]
    )[0][0].data.snapshotRecords[0].payload;
    expect(payload.weather).toEqual(request.weather);
    expect(payload.audiovisualEffects[0]).toMatchObject({
      name: "Rainfall",
      volume: 0.4,
    });
    expect(payload.audiovisualEffects[0]).not.toHaveProperty("uri");
    expect(
      (media.mock.calls as unknown as [{ where: { OR: unknown[] } }][])[0][0]
        .where.OR,
    ).toContainEqual({
      scopeType: "world-definition",
      scopeId: "world-1",
    });
    media.mockResolvedValue({ id: "rain-audio", mimeType: "image/png" });
    await expect(
      service.updateLocation("world-1", "root", request, "gm-1"),
    ).rejects.toThrow("matching the audiovisual cue type");
    await expect(
      service.updateLocation(
        "world-1",
        "root",
        { ...request, weather: { condition: "Wind", wind: { speedKph: -1 } } },
        "gm-1",
      ),
    ).rejects.toThrow("nonnegative speed");
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("replaces an existing map asset and returns the replacement on save and reload", async () => {
    const oldImage = {
      assetId: "old-map",
      altText: "Old map",
      width: 100,
      height: 100,
      mimeType: "image/png",
      orientation: "overhead",
    };
    const grid = { kind: "square", cellSizePixels: 32 };
    let stored = {
      ...draft,
      snapshotRecords: [
        {
          ...draft.snapshotRecords[0],
          payload: {
            ...draft.snapshotRecords[0].payload,
            map: { kind: "image" },
            image: oldImage,
            mapScene: { orientation: "overhead", grid },
            gmDescription: "Private map notes",
            extensions: { "test:private": { hidden: true } },
          },
        },
      ],
    };
    const updateMany = jest.fn(({ data }: { data: Partial<typeof stored> }) => {
      stored = {
        ...stored,
        ...data,
        storageRevision: stored.storageRevision + 1,
      };
      return Promise.resolve({ count: 1 });
    });
    const service = serviceWith({
      worldDefinition: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: "world-1",
            status: "ACTIVE",
            draft: stored,
          }),
        ),
      },
      worldDefinitionDraft: { updateMany },
      mediaAsset: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "new-map", mimeType: "image/webp" }),
      },
    });
    const replacement = {
      assetId: "new-map",
      altText: "Replacement map",
      width: 800,
      height: 600,
      mimeType: "image/webp",
      orientation: "overhead",
    };
    const saved = await service.updateLocation(
      "world-1",
      "root",
      {
        expectedStorageRevision: 3,
        name: "Root",
        kind: "world",
        map: { kind: "image" },
        image: { ...replacement, uri: "transient-url" },
      },
      "gm-1",
    );
    const reloaded = await service.getDraft("world-1", "gm-1");
    for (const response of [saved, reloaded]) {
      expect(response.storageRevision).toBe(4);
      expect(response.records[0].payload).toMatchObject({
        image: replacement,
        mapScene: { grid },
        gmDescription: "Private map notes",
        extensions: { "test:private": { hidden: true } },
      });
      expect(response.records[0].payload).not.toHaveProperty("image.uri");
    }
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
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
        OR: [
          { createdByUserId: "gm-1" },
          { createdByUserId: null },
          { scopeType: "world-definition", scopeId: "world-1" },
        ],
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
it("rejects raw Codex insertion through generic draft replacement", async () => {
  const updateMany = jest.fn();
  const service = serviceWith({
    worldDefinition: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "world-1", status: "ACTIVE", draft }),
    },
    worldDefinitionDraft: { updateMany },
  });
  await expect(
    service.save(
      "world-1",
      {
        expectedStorageRevision: 3,
        revisionName: draft.revisionName,
        content: draft.content,
        records: [
          ...draft.snapshotRecords,
          {
            resourceType: "world-effects",
            sourceId: "effect",
            payload: {
              id: "effect",
              revision: 1,
              name: "Haste",
              modifiers: [
                {
                  id: "speed",
                  propertyPath: "movement.walk",
                  operation: "add",
                  value: 10,
                  allowConditionOverride: true,
                },
              ],
              duration: { kind: "permanent" },
            },
          },
        ],
      },
      "gm-1",
    ),
  ).rejects.toThrow("World Codex workspace");
  expect(updateMany).not.toHaveBeenCalled();
});

it.each([false, true])(
  "enforces the trusted Character Creature baseline during full draft save (changed: %s)",
  async (changed) => {
    const character = {
      id: "guide",
      name: "Guide",
      revision: 1,
      creatureDefinitionId: "creature-original",
      attributes: {},
      skills: {},
      health: { current: 10, maximum: 10, temporary: 0 },
      vision: { day: 60, night: 0 },
      movement: { walk: 30 },
      equipment: [],
      grantedConditions: [],
    };
    const characterRecord = {
      resourceType: "world-character-templates",
      sourceId: character.id,
      payload: character,
    };
    // Both same-World references are available. The replacement fails only
    // because the stored Character's selected Creature is immutable.
    const creatureRecords = ["creature-original", "creature-alternative"].map(
      (sourceId) => ({
        resourceType: "definitions",
        sourceId,
        payload: { kind: "creature", name: sourceId },
      }),
    );
    const storedDraft = {
      ...draft,
      snapshotRecords: [
        ...draft.snapshotRecords,
        ...creatureRecords,
        characterRecord,
      ],
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = serviceWith({
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-1",
          status: "ACTIVE",
          draft: storedDraft,
        }),
      },
      worldDefinitionDraft: { updateMany },
    });
    const operation = service.save(
      "world-1",
      {
        expectedStorageRevision: 3,
        revisionName: draft.revisionName,
        content: draft.content,
        records: [
          ...draft.snapshotRecords,
          ...creatureRecords,
          {
            ...characterRecord,
            payload: {
              ...character,
              name: "Renamed guide",
              revision: 2,
              creatureDefinitionId: changed
                ? "creature-alternative"
                : "creature-original",
            },
          },
        ],
      },
      "gm-1",
      false,
      true,
    );
    if (changed) {
      await expect(operation).rejects.toThrow(
        "A Character's Creature template cannot be changed after creation.",
      );
      expect(updateMany).not.toHaveBeenCalled();
    } else {
      await expect(operation).resolves.toBeDefined();
      expect(updateMany).toHaveBeenCalledTimes(1);
    }
  },
);
