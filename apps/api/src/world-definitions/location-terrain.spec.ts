import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  createTerrainVolume,
  applyTerrainWrites,
  terrainShapePreset,
  type IsometricTerrainManifest,
  type TerrainChunk,
} from "@aow/common";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import {
  canonicalJsonHash,
  buildSnapshotManifest,
  type SnapshotRecordInput,
} from "../domain/snapshot-manifest";
import {
  captureTerrainRecords,
  resolveTerrainManifest,
  TERRAIN_CHUNK_RESOURCE,
} from "./terrain-snapshot";
import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";
import { worldLocationPayload } from "./world-authored-record";

const materials = [
  {
    key: "terrain:grass" as const,
    terrainType: "terrain:grass" as const,
    revision: 1,
    name: "Grass",
  },
];
const volume = applyTerrainWrites(
  createTerrainVolume({ x: 100, y: 100, z: 100 }, materials),
  [
    {
      address: { x: 99, y: 99, z: 99 },
      cell: { materialKey: "terrain:grass", shape: terrainShapePreset("ramp") },
    },
  ],
).volume;
const chunk = volume.chunks[0];
const contentHash = canonicalJsonHash(chunk);
const map: IsometricTerrainManifest = {
  ...volume,
  kind: "isometric",
  chunks: [{ address: chunk.address, contentHash }],
};
const request = {
  expectedDraftId: "draft",
  expectedStorageRevision: 1,
  operationId: "terrain-save-1",
  map,
};
const upload = { expectedDraftId: "draft", expectedStorageRevision: 1, chunk };
const root = {
  resourceType: "locations",
  sourceId: "root",
  payload: worldLocationPayload("root", { name: "Root", kind: "world" }),
};
const content = {
  rootLocationId: "root",
  locationIds: ["root"],
  definitionIds: [],
  schemaDefinitionIds: [],
  worldPlacementDefinitionIds: [],
  modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
};

function setup() {
  let state = {
    id: "draft",
    storageRevision: 1,
    content,
    snapshotRecords: [root] as SnapshotRecordInput[],
    worldDefinitionId: "world",
    revisionName: "Terrain",
    baseRevisionId: null,
    baseSnapshotId: null,
    validationStatus: "NOT_VALIDATED",
    validatedStorageRevision: null,
    validationReport: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    baseSnapshot: null,
  };
  const uploads = new Map<
    string,
    { contentHash: string; payload: TerrainChunk }
  >();
  const receipts = new Map<string, { requestHash: string }>();
  let failReceipt = false;
  const prisma = {
    worldDefinition: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string; ownerUserId: string } }) =>
          where.id === "world" && where.ownerUserId === "gm"
            ? { id: "world", status: "ACTIVE", draft: state }
            : null,
      ),
    },
    worldDefinitionDraft: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { storageRevision: number };
          data: Partial<typeof state>;
        }) => {
          if (where.storageRevision !== state.storageRevision)
            return { count: 0 };
          state = {
            ...state,
            ...data,
            storageRevision: state.storageRevision + 1,
          };
          return { count: 1 };
        },
      ),
    },
    worldTerrainUpload: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => uploads.size),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { draftId_contentHash: { contentHash: string } };
        }) => uploads.get(where.draftId_contentHash.contentHash),
      ),
      upsert: jest.fn(
        async ({
          create,
        }: {
          create: { contentHash: string; payload: TerrainChunk };
        }) => {
          uploads.set(create.contentHash, create);
          return create;
        },
      ),
      findMany: jest.fn(
        async ({ where }: { where: { contentHash: { in: string[] } } }) =>
          [...uploads.values()].filter((u) =>
            where.contentHash.in.includes(u.contentHash),
          ),
      ),
    },
    worldTerrainSave: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { draftId_operationId: { operationId: string } };
        }) => receipts.get(where.draftId_operationId.operationId),
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: { operationId: string; requestHash: string };
        }) => {
          if (failReceipt) throw new Error("transaction failed");
          receipts.set(data.operationId, data);
          return data;
        },
      ),
    },
    $transaction: jest.fn(
      async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
        const before = state;
        try {
          return await run(prisma);
        } catch (error) {
          state = before;
          throw error;
        }
      },
    ),
  };
  const service = new WorldDefinitionAuthoringService(
    prisma as never,
    {} as never,
  );
  return {
    service,
    prisma,
    getState: () => state,
    failReceipt: () => {
      failReceipt = true;
    },
  };
}

describe("Location terrain persistence", () => {
  it("saves an empty isometric grid without generation and switches orientation back to an image", async () => {
    const h = setup();
    const blank = {...map, chunks: []};
    const saved = await h.service.saveLocationTerrain("world", "root", {...request,map:blank}, "gm");
    expect((await h.service.getLocationTerrain("world","root","gm")).chunks).toEqual([]);
    const changed = worldLocationPayload("root", {name:"Location",kind:"world",mapOrientation:"overhead"}, saved.records[0].payload);
    expect(changed.map).toEqual({kind:"image"});
    expect(changed.mapScene?.orientation).toBe("overhead");
    expect((saved.records[0].payload as {map: unknown}).map).toEqual(blank);
  });

  it("uploads without changing the active map, then atomically saves a self-contained capture", async () => {
    const h = setup();
    expect(
      await h.service.uploadTerrainChunk("world", "root", upload, "gm"),
    ).toEqual({ contentHash, address: chunk.address });
    expect(h.getState().storageRevision).toBe(1);
    expect(h.getState().snapshotRecords).toHaveLength(1);
    const saved = await h.service.saveLocationTerrain(
      "world",
      "root",
      request,
      "gm",
    );
    expect(saved.storageRevision).toBe(2);
    expect((saved.records[0].payload as {mapScene: {orientation: string}}).mapScene.orientation).toBe("isometric");
    expect(saved.records).toHaveLength(1); // Chunk buffers are not sent in every World draft response.
    expect(h.getState().snapshotRecords).toHaveLength(2);
    expect(resolveTerrainManifest(map, h.getState().snapshotRecords)).toEqual(
      volume,
    );
    expect(
      await h.service.getTerrainChunk("world", "root", contentHash, "gm"),
    ).toEqual(chunk);
    expect(
      validateWorldDefinitionDraft(content, h.getState().snapshotRecords).valid,
    ).toBe(true);
    const snapshot = buildSnapshotManifest(1, h.getState().snapshotRecords);
    expect(
      resolveTerrainManifest(map, JSON.parse(JSON.stringify(snapshot.records))),
    ).toEqual(volume);
  });
  it("rejects foreign users, unknown Locations, stale revisions and replacement draft identities", async () => {
    const h = setup();
    await expect(
      h.service.uploadTerrainChunk("world", "root", upload, "other"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      h.service.uploadTerrainChunk("world", "missing", upload, "gm"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      h.service.uploadTerrainChunk(
        "world",
        "root",
        { ...upload, expectedStorageRevision: 4 },
        "gm",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      h.service.saveLocationTerrain(
        "world",
        "root",
        { ...request, expectedDraftId: "another" },
        "gm",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.prisma.worldTerrainUpload.upsert).not.toHaveBeenCalled();
  });
  it("rejects missing or mismatched content before changing the Location", async () => {
    const h = setup();
    await expect(
      h.service.saveLocationTerrain("world", "root", request, "gm"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await h.service.uploadTerrainChunk("world", "root", upload, "gm");
    await expect(
      h.service.saveLocationTerrain(
        "world",
        "root",
        {
          ...request,
          map: {
            ...map,
            chunks: [{ address: { x: 0, y: 0, z: 0 }, contentHash }],
          },
        },
        "gm",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.getState().storageRevision).toBe(1);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
  it("replays the same save once and rejects operation-key reuse for another request", async () => {
    const h = setup();
    await h.service.uploadTerrainChunk("world", "root", upload, "gm");
    await h.service.saveLocationTerrain("world", "root", request, "gm");
    expect(
      (await h.service.saveLocationTerrain("world", "root", request, "gm"))
        .storageRevision,
    ).toBe(2);
    expect(h.prisma.worldDefinitionDraft.updateMany).toHaveBeenCalledTimes(1);
    await expect(
      h.service.saveLocationTerrain(
        "world",
        "root",
        { ...request, map: { kind: "image" } },
        "gm",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("cannot read uncommitted chunks or chunks through another Location", async () => {
    const h = setup();
    await h.service.uploadTerrainChunk("world", "root", upload, "gm");
    await expect(
      h.service.getTerrainChunk("world", "root", contentHash, "gm"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await h.service.saveLocationTerrain("world", "root", request, "gm");
    await expect(
      h.service.getTerrainChunk("world", "elsewhere", contentHash, "gm"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      h.service.getTerrainChunk("world", "root", contentHash, "other"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("keeps the old map when the transactional receipt write fails", async () => {
    const h = setup();
    await h.service.uploadTerrainChunk("world", "root", upload, "gm");
    h.failReceipt();
    await expect(
      h.service.saveLocationTerrain("world", "root", request, "gm"),
    ).rejects.toThrow();
    expect(h.getState().storageRevision).toBe(1);
    expect(h.getState().snapshotRecords).toHaveLength(1);
  });
  it("preserves terrain through image/description edits and generic draft saves", async () => {
    const h = setup();
    await h.service.uploadTerrainChunk("world", "root", upload, "gm");
    const saved = await h.service.saveLocationTerrain(
      "world",
      "root",
      request,
      "gm",
    );
    const previous = saved.records[0].payload;
    const changed = worldLocationPayload(
      "root",
      { name: "Renamed", kind: "world", description: "New prose" },
      previous,
    );
    expect(changed.map).toEqual(map);
    await h.service.save(
      "world",
      {
        expectedStorageRevision: 2,
        content,
        revisionName: "Next",
        records: saved.records,
      },
      "gm",
    );
    expect(resolveTerrainManifest(map, h.getState().snapshotRecords)).toEqual(
      volume,
    );
    await expect(
      h.service.save(
        "world",
        {
          expectedStorageRevision: 3,
          content,
          revisionName: "Next",
          records: [
            ...saved.records,
            {
              resourceType: ` ${TERRAIN_CHUNK_RESOURCE} `,
              sourceId: contentHash,
              payload: chunk,
            },
          ],
        },
        "gm",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("switches to image mode without mutating an earlier captured revision", async () => {
    const h = setup();
    await h.service.uploadTerrainChunk("world", "root", upload, "gm");
    await h.service.saveLocationTerrain("world", "root", request, "gm");
    const captured = JSON.parse(JSON.stringify(h.getState().snapshotRecords));
    await h.service.saveLocationTerrain(
      "world",
      "root",
      {
        ...request,
        expectedStorageRevision: 2,
        operationId: "terrain-save-2",
        map: { kind: "image" },
      },
      "gm",
    );
    expect(h.getState().snapshotRecords).toHaveLength(1);
    expect(resolveTerrainManifest(map, captured)).toEqual(volume);
  });
  it("rejects a publishable manifest when the captured chunk was tampered with", () => {
    const records = [
      { ...root, payload: { ...root.payload, map } },
      {
        resourceType: TERRAIN_CHUNK_RESOURCE,
        sourceId: contentHash,
        payload: { ...chunk, cells: [] },
      },
    ];
    expect(
      validateWorldDefinitionDraft(content, records).issues.some(
        (i) => i.code === "terrain-capture-invalid",
      ),
    ).toBe(true);
    expect(() => captureTerrainRecords(records)).toThrow();
  });
});
