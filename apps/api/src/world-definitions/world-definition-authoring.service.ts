import { locationMapIssue } from "@aow/common";
import { worldRuleSnapshotIssue } from "./world-rule-snapshot";
import type { UploadTerrainChunkDto, SaveLocationTerrainDto } from "./dto/location-terrain.dto";
import { TERRAIN_CHUNK_RESOURCE, validateUploadedTerrainChunk, captureTerrainRecords, resolveTerrainManifest } from "./terrain-snapshot";
import { backgroundModifierGrantIssue, professionModifierGrantIssue, skillModifierGrantIssue } from "@aow/common";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
  isCanonicalSnapshotManifest,
  isPublicationJson,
  type SnapshotRecordInput,
} from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import { CORE_MODEL_SCHEMA_RELEASE_ID } from "../model-registry/editable-core-model-seed";
import { ModelRegistryService } from "../model-registry/model-registry.service";
import type { CompiledModelElement } from "../model-registry/model-registry-compiler";
import type {
  CreateWorldDraftDto,
  ExpectedDraftRevisionDto,
  ExpectedWorldMetadataRevisionDto,
  ForkWorldDefinitionDto,
  SaveWorldDraftDto,
  StartWorldDraftDto,
  UpsertWorldCreatureDraftDto,
  UpsertWorldItemDraftDto,
  UpsertWorldLocationDraftDto,
  WorldDraftRecordDto,
} from "./dto/world-definition-authoring.dto";
import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";
import {
  canonicalWorldRecordIssue,
  preservedCreatureImages,
  worldCreaturePayload,
  worldItemPayload,
  worldLocationPayload,
} from "./world-authored-record";

const RESERVED_RECORD = "world-definition-revision";

@Injectable()
export class WorldDefinitionAuthoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly models: ModelRegistryService,
  ) {}

  async create(dto: CreateWorldDraftDto, userId: string) {
    const name = visible(dto.name, "A World name is required.");
    const baseline = newWorldBaseline(name);
    const content = baseline.content;
    const records = normalizeRecords(baseline.records);
    assertBoundedDraftJson(content, records);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const world = await tx.worldDefinition.create({
            data: {
              name,
              description: dto.description?.trim() || null,
              ownerUserId: userId,
            },
            select: {
              id: true,
              name: true,
              description: true,
              metadataRevision: true,
            },
          });
          const draft = await tx.worldDefinitionDraft.create({
            data: {
              worldDefinitionId: world.id,
              revisionName: name,
              content: jsonObject(content),
              snapshotRecords: jsonArray(records),
              createdByUserId: userId,
              updatedByUserId: userId,
            },
            select: draftSelect,
          });
          return {
            ...world,
            description: world.description ?? undefined,
            draft: draftResponse(draft),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async getDraft(worldDefinitionId: string, userId: string) {
    const row = await this.ownedDraft(worldDefinitionId, userId);
    return draftResponse(row.draft);
  }

  async getActiveDraft(worldDefinitionId: string, userId: string) {
    const row = await this.ownedDraft(worldDefinitionId, userId);
    if (row.status !== "ACTIVE") throw archivedConflict();
    return draftResponse(row.draft);
  }

  async uploadTerrainChunk(
    worldId: string,
    locationId: string,
    dto: UploadTerrainChunkDto,
    userId: string,
  ) {
    const owned = await this.prisma.worldDefinition.findUnique({
      where: { id: worldId, ownerUserId: userId },
      select: {
        status: true,
        draft: { select: { id: true, storageRevision: true, content: true } },
      },
    });
    if (!owned?.draft) throw notFound();
    this.assertTerrainDraft({ ...owned, draft: owned.draft }, dto);
    const locationIds = objectValue(owned.draft.content).locationIds;
    if (!Array.isArray(locationIds) || !locationIds.includes(locationId))
      throw worldRecordNotFound();
    const chunk = validateUploadedTerrainChunk(dto.chunk);
    const contentHash = canonicalJsonHash(chunk);
    // Abandoned uploads are disposable; committed data is already in snapshotRecords.
    await this.prisma.worldTerrainUpload.deleteMany({
      where: {
        draftId: owned.draft.id,
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    const prior = await this.prisma.worldTerrainUpload.findUnique({
      where: { draftId_contentHash: { draftId: owned.draft.id, contentHash } },
    });
    if (!prior) {
      const count = await this.prisma.worldTerrainUpload.count({
        where: { draftId: owned.draft.id },
      });
      if (count >= 4096)
        throw new BadRequestException(
          "The draft has too many pending terrain uploads. Save the current map before uploading more.",
        );
      await this.prisma.worldTerrainUpload.upsert({
        where: {
          draftId_contentHash: { draftId: owned.draft.id, contentHash },
        },
        create: {
          draftId: owned.draft.id,
          contentHash,
          payload: jsonObject(chunk),
        },
        update: {},
      });
    }
    return { contentHash, address: chunk.address };
  }

  async getLocationTerrain(
    worldId: string,
    locationId: string,
    userId: string,
  ) {
    const owned = await this.ownedDraft(worldId, userId);
    const records = readRecords(owned.draft.snapshotRecords);
    const location = records.find(
      (r) => r.resourceType === "locations" && r.sourceId === locationId,
    );
    const map = objectValue(objectValue(location?.payload).map);
    if (map.kind !== "isometric")
      throw new NotFoundException("This Location has no terrain map.");
    return resolveTerrainManifest(
      map as unknown as import("@aow/common").IsometricTerrainManifest,
      records,
    );
  }

  async getTerrainChunk(
    worldId: string,
    locationId: string,
    contentHash: string,
    userId: string,
  ) {
    const owned = await this.ownedDraft(worldId, userId);
    const records = readRecords(owned.draft.snapshotRecords);
    const location = records.find(
      (r) => r.resourceType === "locations" && r.sourceId === locationId,
    );
    const map = objectValue(objectValue(location?.payload).map);
    if (
      map.kind !== "isometric" ||
      !Array.isArray(map.chunks) ||
      !map.chunks.some((r) => isObject(r) && r.contentHash === contentHash)
    )
      throw new NotFoundException(
        "The terrain chunk is unavailable for this Location.",
      );
    const record = records.find(
      (r) =>
        r.resourceType === TERRAIN_CHUNK_RESOURCE && r.sourceId === contentHash,
    );
    if (!record || canonicalJsonHash(record.payload) !== contentHash)
      throw new NotFoundException(
        "The terrain chunk is unavailable for this Location.",
      );
    return record.payload;
  }

  async saveLocationTerrain(
    worldId: string,
    locationId: string,
    dto: SaveLocationTerrainDto,
    userId: string,
  ) {
    const owned = await this.ownedDraft(worldId, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (owned.draft.id !== dto.expectedDraftId) throw staleDraft();
    const issue = locationMapIssue(dto.map);
    if (issue) throw new BadRequestException(issue);
    const requestHash = canonicalJsonHash({
      locationId,
      expectedStorageRevision: dto.expectedStorageRevision,
      map: dto.map,
    });
    const receiptKey = {
      draftId: owned.draft.id,
      operationId: dto.operationId,
    };
    const receipt = await this.prisma.worldTerrainSave.findUnique({
      where: { draftId_operationId: receiptKey },
    });
    if (receipt) {
      if (receipt.requestHash !== requestHash)
        throw new ConflictException(
          "This terrain save was already used for different changes.",
        );
      return draftResponse(owned.draft);
    }
    this.assertTerrainDraft(owned, dto);
    const records = readRecords(owned.draft.snapshotRecords);
    const location = records.find(
      (r) => r.resourceType === "locations" && r.sourceId === locationId,
    );
    if (!location || !isObject(location.payload)) throw worldRecordNotFound();
    const missing =
      dto.map.kind === "isometric"
        ? dto.map.chunks
            .map((r) => r.contentHash)
            .filter(
              (hash) =>
                !records.some(
                  (r) =>
                    r.resourceType === TERRAIN_CHUNK_RESOURCE &&
                    r.sourceId === hash,
                ),
            )
        : [];
    const uploads = missing.length
      ? await this.prisma.worldTerrainUpload.findMany({
          where: {
            draftId: owned.draft.id,
            contentHash: { in: missing },
          },
        })
      : [];
    const identity = objectValue(location.payload.identity);
    const version = objectValue(identity.version);
    const payload = {
      ...location.payload,
      map: dto.map,
      mapScene: {
        ...objectValue(location.payload.mapScene),
        orientation:
          dto.map.kind === "isometric"
            ? "isometric"
            : (objectValue(location.payload.image).orientation ?? "scenic"),
      },
      identity: {
        ...identity,
        version: {
          ...version,
          revision: Number(version.revision) + 1,
          updatedAt: new Date().toISOString(),
        },
      },
    };
    const locationIssue = canonicalWorldRecordIssue(
      "locations",
      locationId,
      payload,
    );
    if (locationIssue) throw new BadRequestException(locationIssue);
    const nextRecords = normalizeRecords(
      captureTerrainRecords([
        ...records.filter(
          (r) => !(r.resourceType === "locations" && r.sourceId === locationId),
        ),
        { ...location, payload },
        ...uploads.map((upload) => ({
          resourceType: TERRAIN_CHUNK_RESOURCE,
          sourceId: upload.contentHash,
          payload: upload.payload,
        })),
      ]),
    );
    assertBoundedDraftJson(owned.draft.content, nextRecords);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const updated = await tx.worldDefinitionDraft.updateMany({
            where: {
              id: owned.draft.id,
              storageRevision: dto.expectedStorageRevision,
              worldDefinition: { ownerUserId: userId, status: "ACTIVE" },
            },
            data: {
              snapshotRecords: jsonArray(nextRecords),
              storageRevision: { increment: 1 },
              validationStatus: "NOT_VALIDATED",
              validatedStorageRevision: null,
              validationReport: Prisma.DbNull,
              updatedByUserId: userId,
              updatedAt: new Date(),
            },
          });
          if (updated.count !== 1) throw staleDraft();
          await tx.worldTerrainSave.create({
            data: {
              ...receiptKey,
              requestHash,
              storageRevision: dto.expectedStorageRevision + 1,
            },
          });
          await tx.worldTerrainUpload.deleteMany({
            where: {
              draftId: owned.draft.id,
              contentHash: { in: uploads.map((u) => u.contentHash) },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      );
    } catch (error) {
      // A concurrent retry may have committed the same operation. Never apply it a second time.
      const completed = await this.prisma.worldTerrainSave.findUnique({
        where: { draftId_operationId: receiptKey },
      });
      if (completed?.requestHash === requestHash)
        return this.getDraft(worldId, userId);
      this.rethrow(error);
    }
    return this.getDraft(worldId, userId);
  }

  private assertTerrainDraft(
    owned: { status: string; draft: { id: string; storageRevision: number } },
    dto: { expectedDraftId: string; expectedStorageRevision: number },
  ) {
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (
      owned.draft.id !== dto.expectedDraftId ||
      owned.draft.storageRevision !== dto.expectedStorageRevision
    )
      throw staleDraft();
  }

  createLocation(
    worldDefinitionId: string,
    dto: UpsertWorldLocationDraftDto,
    userId: string,
  ) {
    return this.upsertAuthoredRecord(
      worldDefinitionId,
      "locations",
      undefined,
      dto,
      userId,
    );
  }

  updateLocation(
    worldDefinitionId: string,
    id: string,
    dto: UpsertWorldLocationDraftDto,
    userId: string,
  ) {
    return this.upsertAuthoredRecord(
      worldDefinitionId,
      "locations",
      id,
      dto,
      userId,
    );
  }

  createCreature(
    worldDefinitionId: string,
    dto: UpsertWorldCreatureDraftDto,
    userId: string,
  ) {
    return this.upsertAuthoredRecord(
      worldDefinitionId,
      "creature",
      undefined,
      dto,
      userId,
    );
  }

  updateCreature(
    worldDefinitionId: string,
    id: string,
    dto: UpsertWorldCreatureDraftDto,
    userId: string,
  ) {
    return this.upsertAuthoredRecord(
      worldDefinitionId,
      "creature",
      id,
      dto,
      userId,
    );
  }

  async upgradeLegacyCreature(
    worldDefinitionId: string,
    id: string,
    dto: UpsertWorldCreatureDraftDto,
    userId: string,
  ) {
    const owned = await this.ownedDraft(worldDefinitionId, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (owned.draft.storageRevision !== dto.expectedStorageRevision)
      throw staleDraft();
    const records = readRecords(owned.draft.snapshotRecords);
    const legacy = records.find(
      (record) => record.resourceType === "creatures" && record.sourceId === id,
    );
    if (
      !legacy ||
      records.some(
        (record) =>
          record.resourceType === "definitions" && record.sourceId === id,
      )
    ) {
      throw worldRecordNotFound();
    }
    const authoredModel = await this.authoredConformance(
      worldDefinitionId,
      userId,
      owned.draft.content,
      "creature",
    );
    const prior = isObject(legacy.payload) ? legacy.payload : {};
    const payload = worldCreaturePayload(
      id,
      await this.verifiedWorldCreatureInput(
        worldDefinitionId,
        userId,
        dto,
        prior,
      ),
      authoredModel.conformance,
      {
        ...prior,
        extensions: {
          ...objectValue(prior.extensions),
          "aow:legacy-creature": {
            resourceType: legacy.resourceType,
            ...(legacy.sourceRevision === undefined
              ? {}
              : { sourceRevision: legacy.sourceRevision }),
            payload: legacy.payload,
          },
        },
      },
    );
    const issue = canonicalWorldRecordIssue("definitions", id, payload);
    if (issue) throw new BadRequestException(issue);
    assertGovernedRecordConformance(
      [{ resourceType: "definitions", sourceId: id, payload }],
      authoredModel.releaseIds,
      authoredModel.elements,
    );
    const content = isObject(owned.draft.content)
      ? { ...owned.draft.content }
      : {};
    content.definitionIds = [
      ...new Set([...definitionIds(owned.draft.content), id]),
    ];
    if (Array.isArray(content.creatureIds)) {
      content.creatureIds = content.creatureIds.filter((value) => value !== id);
    }
    return this.persistDraft(
      worldDefinitionId,
      owned.draft,
      {
        expectedStorageRevision: dto.expectedStorageRevision,
        revisionName: owned.draft.revisionName,
        content,
        records: [
          ...records.filter(
            (record) =>
              !(record.resourceType === "creatures" && record.sourceId === id),
          ),
          { resourceType: "definitions", sourceId: id, payload },
        ],
      },
      userId,
    );
  }

  createItem(
    worldDefinitionId: string,
    dto: UpsertWorldItemDraftDto,
    userId: string,
  ) {
    return this.upsertAuthoredRecord(
      worldDefinitionId,
      "item",
      undefined,
      dto,
      userId,
    );
  }

  updateItem(
    worldDefinitionId: string,
    id: string,
    dto: UpsertWorldItemDraftDto,
    userId: string,
  ) {
    return this.upsertAuthoredRecord(
      worldDefinitionId,
      "item",
      id,
      dto,
      userId,
    );
  }

  private async upsertAuthoredRecord(
    worldDefinitionId: string,
    kind: "locations" | "creature" | "item",
    requestedId: string | undefined,
    dto:
      | UpsertWorldLocationDraftDto
      | UpsertWorldCreatureDraftDto
      | UpsertWorldItemDraftDto,
    userId: string,
  ) {
    const owned = await this.ownedDraft(worldDefinitionId, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (owned.draft.storageRevision !== dto.expectedStorageRevision)
      throw staleDraft();
    const records = readRecords(owned.draft.snapshotRecords);
    const resourceType = kind === "locations" ? "locations" : "definitions";
    const id = requestedId ?? randomUUID();
    const existing = records.find(
      (record) =>
        record.resourceType === resourceType && record.sourceId === id,
    );
    if (requestedId && !existing) throw worldRecordNotFound();
    if (!requestedId && existing) throw staleDraft();
    if (
      existing &&
      kind !== "locations" &&
      (!isObject(existing.payload) || existing.payload.kind !== kind)
    )
      throw worldRecordNotFound();
    let payload: unknown;
    let authoredModel:
      | Awaited<
          ReturnType<WorldDefinitionAuthoringService["authoredConformance"]>
        >
      | undefined;
    if (kind === "locations") {
      const location = dto as UpsertWorldLocationDraftDto;
      const rootId = stringValue(owned.draft.content, "rootLocationId");
      const isRoot = id === rootId;
      if (!isRoot && !location.parentLocationId)
        throw new BadRequestException("A parent Location is required.");
      if (location.parentLocationId === id)
        throw new BadRequestException("A Location cannot contain itself.");
      if (
        location.parentLocationId &&
        !records.some(
          (record) =>
            record.resourceType === "locations" &&
            record.sourceId === location.parentLocationId,
        )
      )
        throw new BadRequestException(
          "The parent Location is not in this World draft.",
        );
      if (
        location.parentLocationId &&
        locationAncestorIds(records, location.parentLocationId).has(id)
      )
        throw new BadRequestException(
          "The Location hierarchy cannot contain a cycle.",
        );
      if (location.image) {
        const prior = objectValue(existing?.payload).image;
        const previousAssetId = objectValue(prior).assetId;
        if (location.image.assetId !== previousAssetId) {
          const asset =
            typeof location.image.assetId === "string"
              ? await this.prisma.mediaAsset.findFirst({
                  where: {
                    id: location.image.assetId,
                    OR: [
                      { createdByUserId: userId },
                      { createdByUserId: null },
                    ],
                    mimeType: { startsWith: "image/" },
                  },
                })
              : null;
          if (!asset)
            throw new BadRequestException(
              "The selected Location image is unavailable.",
            );
          location.image = { ...location.image, mimeType: asset.mimeType };
          delete location.image.uri;
        }
      }
      payload = worldLocationPayload(
        id,
        {
          name: visible(location.name, "A Location name is required."),
          description: location.description,
          kind: isRoot ? "world" : location.kind,
          ...(isRoot ? {} : { parentLocationId: location.parentLocationId }),
          gmDescription: location.gmDescription,
          discoveries: location.discoveries,
          image: location.image,
          profileSummary: location.profileSummary,
          profileTags: location.profileTags,
          mapSceneNotes: location.mapSceneNotes,
          mapOrientation: location.mapOrientation,
        },
        existing?.payload,
      );
    } else {
      authoredModel = await this.authoredConformance(
        worldDefinitionId,
        userId,
        owned.draft.content,
        kind,
      );
      if (kind === "creature") {
        payload = worldCreaturePayload(
          id,
          await this.verifiedWorldCreatureInput(
            worldDefinitionId,
            userId,
            dto as UpsertWorldCreatureDraftDto,
            existing?.payload,
          ),
          authoredModel.conformance,
          existing?.payload,
        );
      } else {
        payload = worldItemPayload(
          id,
          await this.verifiedWorldItemInput(
            worldDefinitionId,
            userId,
            dto as UpsertWorldItemDraftDto,
            existing?.payload,
          ),
          authoredModel.conformance,
          existing?.payload,
        );
        if (
          existing &&
          canonicalWorldRecordIssue(
            existing.resourceType,
            existing.sourceId,
            existing.payload,
          )
        ) {
          const built = objectValue(payload);
          payload = {
            ...built,
            extensions: {
              ...objectValue(built.extensions),
              "aow:legacy-item": {
                resourceType: existing.resourceType,
                ...(existing.sourceRevision === undefined
                  ? {}
                  : { sourceRevision: existing.sourceRevision }),
                payload: existing.payload,
              },
            },
          };
        }
      }
    }
    const issue = canonicalWorldRecordIssue(resourceType, id, payload);
    if (issue) throw new BadRequestException(issue);
    if (authoredModel) {
      assertGovernedRecordConformance(
        [{ resourceType, sourceId: id, payload }],
        authoredModel.releaseIds,
        authoredModel.elements,
      );
    }
    const nextRecords = [
      ...records.filter(
        (record) =>
          !(record.resourceType === resourceType && record.sourceId === id),
      ),
      { resourceType, sourceId: id, payload },
    ];
    const content = isObject(owned.draft.content)
      ? { ...owned.draft.content }
      : {};
    const membership = kind === "locations" ? "locationIds" : "definitionIds";
    const current = Array.isArray(content[membership])
      ? content[membership].filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    content[membership] = [...new Set([...current, id])];
    return this.persistDraft(
      worldDefinitionId,
      owned.draft,
      {
        expectedStorageRevision: dto.expectedStorageRevision,
        revisionName: owned.draft.revisionName,
        content,
        records: nextRecords,
      },
      userId,
    );
  }

  private async authoredConformance(
    worldDefinitionId: string,
    userId: string,
    content: Prisma.JsonValue,
    kind: "creature" | "item",
  ) {
    const releaseIds = modelReleaseIds(content);
    const effective = await this.models.resolveEffectiveRoots(
      releaseIds,
      userId,
      worldDefinitionId,
    );
    const concept = effective.elements.find(
      (element) =>
        element.lineage.kind === "concept" &&
        element.lineage.semanticRole === `aow:${kind}`,
    );
    if (!concept)
      throw new BadRequestException(
        `The effective ${kind === "creature" ? "Creature" : "Item"} concept is unavailable.`,
      );
    return {
      releaseIds,
      elements: effective.elements,
      conformance: {
        modelSchemaReleaseIds: releaseIds as never,
        conceptId: concept.lineage.id as never,
      },
    };
  }

  private async verifiedWorldCreatureInput(
    worldId: string,
    userId: string,
    dto: UpsertWorldCreatureDraftDto,
    previous: unknown,
  ): Promise<UpsertWorldCreatureDraftDto> {
    if (!dto.images) return dto;
    const priorImages = preservedCreatureImages(previous);
    const images: Record<string, unknown> = {};
    for (const [role, value] of Object.entries(dto.images)) {
      if (
        !["portrait", "overheadToken", "paperDollToken"].includes(role) ||
        !isObject(value)
      )
        throw new BadRequestException("Choose a valid Creature artwork view.");
      const priorImage = objectValue(priorImages[role]);
      if (
        value.assetId === priorImage.assetId &&
        typeof value.assetId === "string"
      ) {
        images[role] = priorImage;
        continue;
      }
      const asset =
        typeof value.assetId === "string"
          ? await this.prisma.mediaAsset.findFirst({
              where: {
                id: value.assetId,
                createdByUserId: userId,
                scopeType: "world-definition",
                scopeId: worldId,
              },
              select: { id: true, mimeType: true },
            })
          : null;
      if (!asset || !asset.mimeType.startsWith("image/"))
        throw new BadRequestException(
          "Choose an image belonging to this World.",
        );
      images[role] = { ...value, mimeType: asset.mimeType };
    }
    return { ...dto, images };
  }

  private async verifiedWorldItemInput(
    worldDefinitionId: string,
    userId: string,
    dto: UpsertWorldItemDraftDto,
    previous: unknown,
  ): Promise<UpsertWorldItemDraftDto> {
    const submittedImage = isObject(dto.image) ? dto.image : {};
    const priorPayload = isObject(previous) ? previous : {};
    const priorImage = isObject(priorPayload.image) ? priorPayload.image : {};
    const assetId = submittedImage.assetId;

    if (
      typeof assetId === "string" &&
      assetId.length > 0 &&
      priorImage.assetId === assetId
    ) {
      return {
        ...dto,
        image: {
          ...priorImage,
          altText: submittedImage.altText,
        },
      };
    }

    if (typeof assetId !== "string" || !assetId.trim())
      throw invalidWorldItemImage();
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        createdByUserId: userId,
        scopeType: "world-definition",
        scopeId: worldDefinitionId,
      },
      select: { id: true, mimeType: true },
    });
    if (!asset || !asset.mimeType.startsWith("image/"))
      throw invalidWorldItemImage();
    return {
      ...dto,
      image: { ...submittedImage, mimeType: asset.mimeType },
    };
  }

  async startDraft(
    worldDefinitionId: string,
    dto: StartWorldDraftDto,
    userId: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const world = await tx.worldDefinition.findUnique({
            where: { id: worldDefinitionId, ownerUserId: userId },
            select: {
              status: true,
              currentRevisionId: true,
              draft: { select: draftSelect },
              currentRevision: {
                select: {
                  id: true,
                  revisionNumber: true,
                  name: true,
                  content: true,
                  snapshots: {
                    select: { id: true, manifest: true },
                    orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
                    take: 1,
                  },
                },
              },
            },
          });
          if (!world) throw notFound();
          if (world.status !== "ACTIVE") throw archivedConflict();
          if (world.draft) return draftResponse(world.draft);
          if (
            !world.currentRevision ||
            world.currentRevisionId !== dto.baseRevisionId
          ) {
            throw new ConflictException(
              "The published World changed; refresh before starting its draft.",
            );
          }
          const snapshot = world.currentRevision.snapshots[0];
          if (!snapshot || !isCanonicalSnapshotManifest(snapshot.manifest)) {
            throw new BadRequestException(
              "The selected published World revision cannot seed an authoring draft.",
            );
          }
          if (!isObject(world.currentRevision.content)) {
            throw new BadRequestException(
              "The selected published World revision cannot seed an authoring draft.",
            );
          }
          const capturedRevision = snapshot.manifest.records.find(
            (record) => record.resourceType === RESERVED_RECORD,
          );
          if (
            !capturedRevision ||
            capturedRevision.sourceId !== world.currentRevision.id ||
            capturedRevision.sourceRevision !==
              world.currentRevision.revisionNumber ||
            canonicalJsonHash(capturedRevision.payload) !==
              canonicalJsonHash(world.currentRevision.content)
          ) {
            throw new BadRequestException(
              "The selected published World revision cannot seed an authoring draft.",
            );
          }
          const content = {
            ...world.currentRevision.content,
            worldPlacementDefinitionIds: Array.isArray(
              world.currentRevision.content.worldPlacementDefinitionIds,
            )
              ? world.currentRevision.content.worldPlacementDefinitionIds
              : [],
            modelSchemaReleaseIds:
              modelReleaseIds(world.currentRevision.content).length > 0
                ? world.currentRevision.content.modelSchemaReleaseIds
                : [CORE_MODEL_SCHEMA_RELEASE_ID],
          };
          const records = snapshot.manifest.records
            .filter((record) => record.resourceType !== RESERVED_RECORD)
            .map(({ resourceType, sourceId, sourceRevision, payload }) => ({
              resourceType,
              sourceId,
              ...(sourceRevision === undefined ? {} : { sourceRevision }),
              payload,
            }));
          const draft = await tx.worldDefinitionDraft.create({
            data: {
              worldDefinitionId,
              baseRevisionId: world.currentRevision.id,
              baseSnapshotId: snapshot.id,
              revisionName: world.currentRevision.name,
              content: jsonObject(content),
              snapshotRecords: jsonArray(records),
              createdByUserId: userId,
              updatedByUserId: userId,
            },
            select: draftSelect,
          });
          return draftResponse(draft);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaUniqueConflict(error))
        return this.getDraft(worldDefinitionId, userId);
      this.rethrow(error);
    }
  }

  async save(
    worldDefinitionId: string,
    dto: SaveWorldDraftDto,
    userId: string,
    authoredRules = false,
  ) {
    const owned = await this.ownedDraft(worldDefinitionId, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (dto.expectedDraftId && owned.draft.id !== dto.expectedDraftId)
      throw staleDraft();
    if (owned.draft.storageRevision !== dto.expectedStorageRevision)
      throw staleDraft();
    if (
      dto.records.some((r) => r.resourceType.trim() === TERRAIN_CHUNK_RESOURCE)
    )
      throw new BadRequestException(
        "Terrain chunks must be saved through the Location map editor.",
      );
    const records = normalizeRecords([
      ...dto.records,
      ...readRecords(owned.draft.snapshotRecords).filter(
        (r) => r.resourceType === TERRAIN_CHUNK_RESOURCE,
      ),
    ]);
    const ruleIssue = worldRuleSnapshotIssue(records);
    if (ruleIssue) throw new BadRequestException(ruleIssue);
    if (
      !authoredRules &&
      canonicalJsonHash(records.filter((r) => r.resourceType === "world-rules")) !==
        canonicalJsonHash(
          readRecords(owned.draft.snapshotRecords).filter(
            (r) => r.resourceType === "world-rules",
          ),
        )
    )
      throw new BadRequestException(
        "Edit executable rules through the World Rules workspace.",
      );
    for (const record of records) {
      if (
        record.resourceType !== "definitions" ||
        !isObject(record.payload) ||
        !["profession", "skill", "background"].includes(String(record.payload.kind))
      )
        continue;
      const issue =
        record.payload.kind === "background" ? backgroundModifierGrantIssue(record.payload.components) : record.payload.kind === "skill"
          ? skillModifierGrantIssue(record.payload.components)
          : professionModifierGrantIssue(record.payload.components);
      if (issue) throw new BadRequestException(issue);
    }
    assertBoundedDraftJson(dto.content, records);
    assertProtectedRecordsUnchanged(
      owned.draft.content,
      readRecords(owned.draft.snapshotRecords),
      dto.content,
      records,
    );
    return this.persistDraft(
      worldDefinitionId,
      owned.draft,
      { ...dto, records },
      userId,
    );
  }

  private async persistDraft(
    worldDefinitionId: string,
    draft: {
      readonly id: string;
      readonly storageRevision: number;
    },
    dto: SaveWorldDraftDto,
    userId: string,
  ) {
    const records = normalizeRecords(dto.records);
    assertBoundedDraftJson(dto.content, records);
    const result = await this.prisma.worldDefinitionDraft.updateMany({
      where: {
        id: draft.id,
        storageRevision: dto.expectedStorageRevision,
      },
      data: {
        revisionName: visible(dto.revisionName, "A revision name is required."),
        content: jsonObject(dto.content),
        snapshotRecords: jsonArray(records),
        storageRevision: { increment: 1 },
        validationStatus: "NOT_VALIDATED",
        validatedStorageRevision: null,
        validationReport: Prisma.DbNull,
        updatedByUserId: userId,
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1) throw staleDraft();
    return this.getDraft(worldDefinitionId, userId);
  }

  async validate(
    worldDefinitionId: string,
    dto: ExpectedDraftRevisionDto,
    userId: string,
  ) {
    const owned = await this.ownedDraft(worldDefinitionId, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (owned.draft.storageRevision !== dto.expectedStorageRevision)
      throw staleDraft();
    const records = readRecords(owned.draft.snapshotRecords);
    const structuralReport = validateWorldDefinitionDraft(
      owned.draft.content,
      records,
    );
    const issues = [...structuralReport.issues];
    const modelSchemaReleaseIds = modelReleaseIds(owned.draft.content);
    if (modelSchemaReleaseIds.length > 0) {
      try {
        const effectiveModel = await this.models.resolveEffectiveRoots(
          modelSchemaReleaseIds,
          userId,
          worldDefinitionId,
        );
        assertGovernedRecordConformance(
          records,
          modelSchemaReleaseIds,
          effectiveModel.elements,
          new Set(definitionIds(owned.draft.content)),
        );
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw unavailable();
        issues.push({
          code: "model-conformance-invalid",
          subject: "World draft",
          detail:
            "The selected Model Schema releases or governed resources are invalid.",
        });
      }
    }
    issues.push(
      ...(await itemMediaAuthorizationIssues(
        this.prisma,
        records,
        new Set(definitionIds(owned.draft.content)),
        worldDefinitionId,
        userId,
      )),
    );
    issues.sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        left.subject.localeCompare(right.subject),
    );
    const report = { valid: issues.length === 0, issues };
    const advanced = await this.prisma.worldDefinitionDraft.updateMany({
      where: {
        id: owned.draft.id,
        storageRevision: dto.expectedStorageRevision,
      },
      data: {
        validationStatus: report.valid ? "VALID" : "BLOCKED",
        validatedStorageRevision: dto.expectedStorageRevision,
        validationReport: jsonObject(report),
      },
    });
    if (advanced.count !== 1) throw staleDraft();
    return report;
  }

  async publish(
    worldDefinitionId: string,
    dto: ExpectedDraftRevisionDto,
    userId: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const prior = await tx.worldDefinitionRevision.findFirst({
            where: {
              worldDefinitionId,
              sourceDraftRevision: dto.expectedStorageRevision,
              worldDefinition: { ownerUserId: userId },
            },
            select: {
              id: true,
              revisionNumber: true,
              predecessorRevisionId: true,
              name: true,
              contentHash: true,
              publishedAt: true,
              snapshots: {
                select: { id: true, contentHash: true, capturedAt: true },
                take: 1,
              },
            },
          });
          if (prior) return publicationResponse(prior);
          const world = await tx.worldDefinition.findUnique({
            where: { id: worldDefinitionId, ownerUserId: userId },
            select: {
              id: true,
              status: true,
              currentRevisionId: true,
              draft: { select: draftSelect },
              currentRevision: { select: { revisionNumber: true } },
            },
          });
          if (!world?.draft) throw notFound();
          if (world.status !== "ACTIVE") throw archivedConflict();
          const draft = world.draft;
          if (draft.storageRevision !== dto.expectedStorageRevision)
            throw staleDraft();
          if (
            (draft.baseRevisionId ?? null) !== (world.currentRevisionId ?? null)
          )
            throw staleBase();
          if (
            draft.validationStatus !== "VALID" ||
            draft.validatedStorageRevision !== draft.storageRevision
          ) {
            throw new BadRequestException(
              "Validate this exact World draft revision before publishing it.",
            );
          }
          const records = readRecords(draft.snapshotRecords);
          const report = validateWorldDefinitionDraft(draft.content, records);
          if (!report.valid)
            throw new BadRequestException(
              "The World draft must pass complete-revision validation before publication.",
            );
          const mediaIssues = await itemMediaAuthorizationIssues(
            tx,
            records,
            new Set(definitionIds(draft.content)),
            worldDefinitionId,
            userId,
          );
          if (mediaIssues.length > 0) throw invalidWorldItemImage();
          const modelSchemaReleaseIds = modelReleaseIds(draft.content);
          const effectiveModel = await this.models.resolveEffectiveRoots(
            modelSchemaReleaseIds,
            userId,
            worldDefinitionId,
          );
          assertGovernedRecordConformance(
            records,
            modelSchemaReleaseIds,
            effectiveModel.elements,
            new Set(definitionIds(draft.content)),
          );
          if (modelSchemaReleaseIds.length > 0) {
            const accessibleReleaseCount = await tx.modelSchemaRelease.count({
              where: {
                id: { in: modelSchemaReleaseIds },
                registry: {
                  OR: [{ ownerUserId: userId }, { ownerUserId: null }],
                },
              },
            });
            if (accessibleReleaseCount !== modelSchemaReleaseIds.length) {
              throw new BadRequestException(
                "One or more selected Model Schema releases are unavailable.",
              );
            }
          }
          const revisionNumber =
            (world.currentRevision?.revisionNumber ?? 0) + 1;
          const revision = await tx.worldDefinitionRevision.create({
            data: {
              worldDefinitionId,
              revisionNumber,
              predecessorRevisionId: world.currentRevisionId,
              name: draft.revisionName,
              content: jsonValue(draft.content),
              contentHash: canonicalContentHash(draft.content),
              createdByUserId: userId,
              sourceDraftRevision: draft.storageRevision,
              modelSchemaSelections: {
                create: modelSchemaReleaseIds.map(
                  (modelSchemaReleaseId, selectionOrder) => ({
                    modelSchemaReleaseId,
                    selectionOrder,
                  }),
                ),
              },
            },
            select: {
              id: true,
              revisionNumber: true,
              predecessorRevisionId: true,
              name: true,
              contentHash: true,
              publishedAt: true,
            },
          });
          const manifest = buildSnapshotManifest(1, [
            {
              resourceType: RESERVED_RECORD,
              sourceId: revision.id,
              sourceRevision: revision.revisionNumber,
              payload: draft.content,
            },
            ...records,
          ]);
          const snapshot = await tx.worldDefinitionSnapshot.create({
            data: {
              worldDefinitionId,
              worldDefinitionRevisionId: revision.id,
              manifest: jsonObject(manifest),
              contentHash: manifest.contentHash,
            },
            select: { id: true, contentHash: true, capturedAt: true },
          });
          const head = await tx.worldDefinition.updateMany({
            where: {
              id: worldDefinitionId,
              ownerUserId: userId,
              status: "ACTIVE",
              currentRevisionId: world.currentRevisionId,
            },
            data: { currentRevisionId: revision.id, updatedAt: new Date() },
          });
          if (head.count !== 1) throw staleBase();
          const draftAdvance = await tx.worldDefinitionDraft.updateMany({
            where: { id: draft.id, storageRevision: draft.storageRevision },
            data: {
              baseRevisionId: revision.id,
              baseSnapshotId: snapshot.id,
              storageRevision: draft.storageRevision + 1,
              validationStatus: "VALID",
              validatedStorageRevision: draft.storageRevision + 1,
              validationReport: jsonObject(report),
              updatedByUserId: userId,
              updatedAt: new Date(),
            },
          });
          if (draftAdvance.count !== 1) throw staleDraft();
          return publicationResponse({ ...revision, snapshots: [snapshot] });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          // Valid terrain captures include chunk payloads; hashing and persisting
          // those snapshots can exceed Prisma's five-second default.
          timeout: 60_000,
        },
      );
    } catch (error) {
      if (isPrismaConflict(error)) throw staleDraft();
      this.rethrow(error);
    }
  }

  async archive(
    id: string,
    dto: ExpectedWorldMetadataRevisionDto,
    userId: string,
  ) {
    return this.setArchived(id, dto.expectedMetadataRevision, userId, true);
  }

  async restore(
    id: string,
    dto: ExpectedWorldMetadataRevisionDto,
    userId: string,
  ) {
    return this.setArchived(id, dto.expectedMetadataRevision, userId, false);
  }

  async fork(
    sourceWorldDefinitionId: string,
    dto: ForkWorldDefinitionDto,
    userId: string,
  ) {
    const name = visible(dto.name, "A fork name is required.");
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const source = await tx.worldDefinitionSnapshot.findFirst({
            where: {
              id: dto.sourceSnapshotId,
              worldDefinitionId: sourceWorldDefinitionId,
              worldDefinitionRevision: {
                worldDefinition: { ownerUserId: userId },
              },
            },
            select: {
              id: true,
              worldDefinitionId: true,
              manifest: true,
              worldDefinitionRevision: {
                select: { content: true, name: true },
              },
            },
          });
          if (!source || !isCanonicalSnapshotManifest(source.manifest))
            throw notFound();
          const targetWorldId = randomUUID();
          const sourceRecords = source.manifest.records.filter(
            (record) => record.resourceType !== RESERVED_RECORD,
          );
          const mapping: ResourceIdentityMapping = {};
          for (const record of sourceRecords) {
            if (record.resourceType === TERRAIN_CHUNK_RESOURCE) continue;
            (mapping[record.resourceType] ??= {})[record.sourceId] =
              randomUUID();
          }
          const records = sourceRecords.map((record) => ({
            resourceType: record.resourceType,
            sourceId:
              mapping[record.resourceType]?.[record.sourceId] ??
              record.sourceId,
            ...(record.sourceRevision === undefined
              ? {}
              : { sourceRevision: record.sourceRevision }),
            payload:
              record.resourceType === TERRAIN_CHUNK_RESOURCE
                ? record.payload
                : rewriteReferences(
                    record.payload,
                    mapping,
                    record.resourceType,
                  ),
          }));
          const world = await tx.worldDefinition.create({
            data: {
              id: targetWorldId,
              name,
              description: dto.description?.trim() || null,
              ownerUserId: userId,
            },
            select: {
              id: true,
              name: true,
              description: true,
              metadataRevision: true,
            },
          });
          const draft = await tx.worldDefinitionDraft.create({
            data: {
              worldDefinitionId: world.id,
              revisionName: name,
              content: jsonObject(
                rewriteReferences(
                  source.worldDefinitionRevision.content,
                  mapping,
                ),
              ),
              snapshotRecords: jsonArray(records),
              createdByUserId: userId,
              updatedByUserId: userId,
            },
            select: draftSelect,
          });
          await tx.worldDefinitionForkProvenance.create({
            data: {
              targetWorldDefinitionId: world.id,
              sourceWorldDefinitionId: source.worldDefinitionId,
              sourceSnapshotId: source.id,
              identityMapping: jsonObject(mapping),
              createdByUserId: userId,
            },
          });
          return {
            ...world,
            description: world.description ?? undefined,
            draft: draftResponse(draft),
            forkedFrom: { revisionName: source.worldDefinitionRevision.name },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async impact(id: string, userId: string) {
    const owned = await this.ownedDraft(id, userId);
    const campaigns = await this.prisma.campaignDefinition.findMany({
      where: { worldDefinitionId: id, ownerUserId: userId },
      select: {
        id: true,
        name: true,
        currentRevision: { select: { capturedWorldSnapshotId: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const current = new Map<string, string>();
    if (
      owned.draft.baseSnapshot &&
      isCanonicalSnapshotManifest(owned.draft.baseSnapshot.manifest)
    ) {
      for (const record of owned.draft.baseSnapshot.manifest.records)
        current.set(
          `${record.resourceType}\0${record.sourceId}`,
          record.contentHash,
        );
    }
    const desired = new Map(
      normalizeRecords(readRecords(owned.draft.snapshotRecords)).map(
        (record) => [
          `${record.resourceType}\0${record.sourceId}`,
          canonicalJsonHash(record.payload),
        ],
      ),
    );
    let added = 0,
      removed = 0,
      changed = 0;
    for (const [key, hash] of desired) {
      if (!current.has(key)) added += 1;
      else if (current.get(key) !== hash) changed += 1;
    }
    for (const key of current.keys())
      if (!key.startsWith(`${RESERVED_RECORD}\0`) && !desired.has(key))
        removed += 1;
    return {
      draftStorageRevision: owned.draft.storageRevision,
      changes: { added, removed, changed },
      downstreamCampaigns: campaigns.map((campaign) => ({
        campaignDefinitionId: campaign.id,
        name: campaign.name,
        eligibility:
          campaign.currentRevision?.capturedWorldSnapshotId ===
          owned.draft.baseSnapshotId
            ? "eligible-after-publication"
            : "not-direct-successor",
      })),
    };
  }

  private async setArchived(
    id: string,
    expected: number,
    userId: string,
    archived: boolean,
  ) {
    const result = await this.prisma.worldDefinition.updateMany({
      where: {
        id,
        ownerUserId: userId,
        metadataRevision: expected,
        status: archived ? "ACTIVE" : "ARCHIVED",
      },
      data: {
        status: archived ? "ARCHIVED" : "ACTIVE",
        archivedAt: archived ? new Date() : null,
        metadataRevision: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1)
      throw new ConflictException(
        "The World lifecycle changed; refresh before trying again.",
      );
    const row = await this.prisma.worldDefinition.findUnique({
      where: { id, ownerUserId: userId },
      select: {
        id: true,
        name: true,
        status: true,
        archivedAt: true,
        metadataRevision: true,
      },
    });
    if (!row) throw notFound();
    return {
      ...row,
      status: row.status.toLowerCase(),
      archivedAt: row.archivedAt?.toISOString(),
    };
  }

  private async ownedDraft(id: string, userId: string) {
    let row;
    try {
      row = await this.prisma.worldDefinition.findUnique({
        where: { id, ownerUserId: userId },
        select: {
          id: true,
          status: true,
          metadataRevision: true,
          draft: { select: draftSelect },
        },
      });
    } catch {
      throw unavailable();
    }
    if (!row?.draft) throw notFound();
    return { ...row, draft: row.draft };
  }

  private rethrow(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    )
      throw error;
    throw unavailable();
  }
}

const draftSelect = {
  id: true,
  worldDefinitionId: true,
  baseRevisionId: true,
  baseSnapshotId: true,
  revisionName: true,
  content: true,
  snapshotRecords: true,
  storageRevision: true,
  validationStatus: true,
  validatedStorageRevision: true,
  validationReport: true,
  createdAt: true,
  updatedAt: true,
  baseSnapshot: { select: { manifest: true } },
} as const satisfies Prisma.WorldDefinitionDraftSelect;

function draftResponse(
  row: Prisma.WorldDefinitionDraftGetPayload<{ select: typeof draftSelect }>,
) {
  return {
    id: row.id,
    worldDefinitionId: row.worldDefinitionId,
    baseRevisionId: row.baseRevisionId ?? undefined,
    baseSnapshotId: row.baseSnapshotId ?? undefined,
    revisionName: row.revisionName,
    content: row.content,
    records: readRecords(row.snapshotRecords).filter((r) => r.resourceType !== TERRAIN_CHUNK_RESOURCE),
    storageRevision: row.storageRevision,
    validationStatus: row.validationStatus.toLowerCase().replaceAll("_", "-"),
    validatedStorageRevision: row.validatedStorageRevision ?? undefined,
    validationReport: row.validationReport ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function publicationResponse(row: {
  id: string;
  revisionNumber: number;
  predecessorRevisionId: string | null;
  name: string;
  contentHash: string;
  publishedAt: Date;
  snapshots: readonly { id: string; contentHash: string; capturedAt: Date }[];
}) {
  const snapshot = row.snapshots[0];
  return {
    id: row.id,
    revisionNumber: row.revisionNumber,
    predecessorRevisionId: row.predecessorRevisionId ?? undefined,
    name: row.name,
    contentHash: row.contentHash,
    publishedAt: row.publishedAt.toISOString(),
    snapshot: snapshot
      ? {
          id: snapshot.id,
          contentHash: snapshot.contentHash,
          capturedAt: snapshot.capturedAt.toISOString(),
        }
      : undefined,
  };
}
function normalizeRecords(
  records: readonly WorldDraftRecordDto[],
): SnapshotRecordInput[] {
  return records.map((r) => ({
    resourceType: r.resourceType.trim(),
    sourceId: r.sourceId.trim(),
    ...(r.sourceRevision === undefined
      ? {}
      : { sourceRevision: r.sourceRevision }),
    payload: r.payload,
  }));
}
function assertBoundedDraftJson(
  content: unknown,
  records: readonly SnapshotRecordInput[],
): void {
  if (
    !isPublicationJson(content) ||
    records.some((record) => !isPublicationJson(record.payload))
  ) {
    throw new BadRequestException("World draft content must be bounded JSON.");
  }
}
function readRecords(value: Prisma.JsonValue): WorldDraftRecordDto[] {
  if (!Array.isArray(value)) return [];
  const records: WorldDraftRecordDto[] = [];
  for (const valueRecord of value) {
    if (!isObject(valueRecord)) continue;
    records.push({
      resourceType:
        typeof valueRecord.resourceType === "string"
          ? valueRecord.resourceType
          : "",
      sourceId:
        typeof valueRecord.sourceId === "string" ? valueRecord.sourceId : "",
      ...(typeof valueRecord.sourceRevision === "number"
        ? { sourceRevision: valueRecord.sourceRevision }
        : {}),
      payload: valueRecord.payload,
    });
  }
  return records;
}
function newWorldBaseline(name: string) {
  const rootLocationId = randomUUID();
  return {
    content: {
      rootLocationId,
      locationIds: [rootLocationId],
      definitionIds: [],
      schemaDefinitionIds: [],
      worldPlacementDefinitionIds: [],
      modelSchemaReleaseIds: [CORE_MODEL_SCHEMA_RELEASE_ID],
    },
    records: [
      {
        resourceType: "locations",
        sourceId: rootLocationId,
        payload: worldLocationPayload(rootLocationId, { name, kind: "world" }),
      },
    ],
  };
}
type ResourceIdentityMapping = Record<string, Record<string, string>>;
function rewriteReferences(
  value: unknown,
  mapping: ResourceIdentityMapping,
  currentResource?: string,
  fieldName?: string,
): unknown {
  if (typeof value === "string")
    return mappedReference(value, mapping, currentResource, fieldName) ?? value;
  if (Array.isArray(value))
    return value.map((entry) =>
      rewriteReferences(entry, mapping, currentResource, fieldName),
    );
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        rewriteReferences(entry, mapping, currentResource, key),
      ]),
    );
  return value;
}
function mappedReference(
  value: string,
  mapping: ResourceIdentityMapping,
  currentResource?: string,
  fieldName?: string,
): string | undefined {
  if (fieldName === "id" && currentResource)
    return mapping[currentResource]?.[value];
  const normalized = fieldName?.toLowerCase() ?? "";
  const preferred = normalized.includes("location")
    ? ["locations"]
    : normalized.includes("schema")
      ? ["extension-schemas", "definitions"]
      : normalized.includes("definition")
        ? ["definitions"]
        : normalized.includes("creature")
          ? ["creatures"]
          : normalized.includes("item")
            ? ["items"]
            : normalized.endsWith("id") || normalized.endsWith("ids")
              ? Object.keys(mapping)
              : [];
  const matches = preferred.flatMap((resource) =>
    mapping[resource]?.[value] ? [mapping[resource][value]] : [],
  );
  return matches.length === 1 ? matches[0] : undefined;
}
function jsonObject(value: unknown): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}
function jsonArray(value: unknown): Prisma.InputJsonArray {
  return value as Prisma.InputJsonArray;
}
function jsonValue(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
function canonicalContentHash(value: Prisma.JsonValue): string {
  return canonicalJsonHash(value);
}
function modelReleaseIds(value: Prisma.JsonValue): string[] {
  if (!isObject(value) || !Array.isArray(value.modelSchemaReleaseIds))
    return [];
  return value.modelSchemaReleaseIds.filter(
    (id): id is string => typeof id === "string",
  );
}

function definitionIds(value: Prisma.JsonValue): string[] {
  if (!isObject(value) || !Array.isArray(value.definitionIds)) return [];
  return value.definitionIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function assertProtectedRecordsUnchanged(
  priorContent: Prisma.JsonValue,
  priorRecords: readonly WorldDraftRecordDto[],
  nextContent: unknown,
  nextRecords: readonly WorldDraftRecordDto[],
): void {
  const protectedRows = (records: readonly WorldDraftRecordDto[]) =>
    records
      .filter(isProtectedAuthoredRecord)
      .map((record) => ({
        resourceType: record.resourceType,
        sourceId: record.sourceId,
        ...(record.sourceRevision === undefined
          ? {}
          : { sourceRevision: record.sourceRevision }),
        payload: record.payload,
      }))
      .sort((left, right) =>
        `${left.resourceType}\0${left.sourceId}`.localeCompare(
          `${right.resourceType}\0${right.sourceId}`,
        ),
      );
  if (
    canonicalJsonHash(protectedRows(priorRecords)) !==
    canonicalJsonHash(protectedRows(nextRecords))
  ) {
    throw new BadRequestException(
      "Locations, Creatures, and Items must be changed through their dedicated authoring actions.",
    );
  }
  const beforeLocations = new Set(
    stringArrayValue(priorContent, "locationIds"),
  );
  const afterLocations = new Set(stringArrayValue(nextContent, "locationIds"));
  if (!equalStringSets(beforeLocations, afterLocations)) {
    throw new BadRequestException(
      "Location membership must be changed through dedicated Atlas actions.",
    );
  }
  if (
    stringValue(priorContent, "rootLocationId") !==
    (isObject(nextContent) && typeof nextContent.rootLocationId === "string"
      ? nextContent.rootLocationId
      : undefined)
  ) {
    throw new BadRequestException(
      "The World root must be changed through dedicated Atlas actions.",
    );
  }
  const protectedDefinitionIds = new Set(
    [...priorRecords, ...nextRecords]
      .filter(
        (record) =>
          record.resourceType === "definitions" &&
          isProtectedAuthoredRecord(record),
      )
      .map((record) => record.sourceId),
  );
  const beforeDefinitions = new Set(
    stringArrayValue(priorContent, "definitionIds").filter((id) =>
      protectedDefinitionIds.has(id),
    ),
  );
  const afterDefinitions = new Set(
    stringArrayValue(nextContent, "definitionIds").filter((id) =>
      protectedDefinitionIds.has(id),
    ),
  );
  if (!equalStringSets(beforeDefinitions, afterDefinitions)) {
    throw new BadRequestException(
      "Creature and Item membership must be changed through dedicated library actions.",
    );
  }
}

function isProtectedAuthoredRecord(record: WorldDraftRecordDto): boolean {
  if (
    record.resourceType === "locations" ||
    record.resourceType === "creatures" ||
    record.resourceType === "items"
  ) {
    return true;
  }
  if (record.resourceType !== "definitions" || !isObject(record.payload)) {
    return false;
  }
  const kind = record.payload.kind ?? record.payload.definitionType;
  return kind === "creature" || kind === "item";
}

function stringArrayValue(value: unknown, key: string): string[] {
  if (!isObject(value) || !Array.isArray(value[key])) return [];
  return value[key].filter(
    (entry): entry is string => typeof entry === "string",
  );
}

function equalStringSets(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

async function itemMediaAuthorizationIssues(
  client: Pick<PrismaService, "mediaAsset">,
  records: readonly WorldDraftRecordDto[],
  declaredDefinitionIds: ReadonlySet<string>,
  worldDefinitionId: string,
  userId: string,
) {
  const items = records.filter(
    (record) =>
      record.resourceType === "definitions" &&
      declaredDefinitionIds.has(record.sourceId) &&
      isObject(record.payload) &&
      record.payload.kind === "item",
  );
  const issues = await Promise.all(
    items.map(async (record) => {
      const image =
        isObject(record.payload) && isObject(record.payload.image)
          ? record.payload.image
          : {};
      const assetId = image.assetId;
      const asset =
        typeof assetId === "string" && assetId.trim()
          ? await client.mediaAsset.findFirst({
              where: {
                id: assetId,
                createdByUserId: userId,
                scopeType: "world-definition",
                scopeId: worldDefinitionId,
                mimeType: { startsWith: "image/" },
              },
              select: { id: true },
            })
          : null;
      return asset
        ? undefined
        : {
            code: "item-media-unauthorized",
            subject: authoredRecordName(record),
            detail: "The Item image is not an authorized image for this World.",
          };
    }),
  );
  return issues.filter((issue) => issue !== undefined);
}

function authoredRecordName(record: WorldDraftRecordDto): string {
  if (isObject(record.payload)) {
    if (typeof record.payload.name === "string" && record.payload.name.trim()) {
      return record.payload.name.trim();
    }
    if (
      isObject(record.payload.identity) &&
      typeof record.payload.identity.name === "string" &&
      record.payload.identity.name.trim()
    ) {
      return record.payload.identity.name.trim();
    }
  }
  return "World draft record";
}
function stringValue(value: Prisma.JsonValue, key: string): string | undefined {
  return isObject(value) && typeof value[key] === "string"
    ? value[key]
    : undefined;
}
function locationAncestorIds(
  records: readonly WorldDraftRecordDto[],
  startId: string,
): Set<string> {
  const parents = new Map<string, string>();
  for (const record of records) {
    if (record.resourceType !== "locations" || !isObject(record.payload))
      continue;
    const placement = record.payload.placement;
    if (
      isObject(placement) &&
      placement.kind === "within-parent" &&
      typeof placement.parentLocationId === "string"
    )
      parents.set(record.sourceId, placement.parentLocationId);
  }
  const ancestors = new Set<string>();
  let cursor: string | undefined = startId;
  while (cursor && !ancestors.has(cursor)) {
    ancestors.add(cursor);
    cursor = parents.get(cursor);
  }
  return ancestors;
}
function worldRecordNotFound(): NotFoundException {
  return new NotFoundException(
    "The selected World draft record was not found.",
  );
}
function invalidWorldItemImage(): BadRequestException {
  return new BadRequestException(
    "The selected Item image is unavailable for this World.",
  );
}
export function assertGovernedRecordConformance(
  records: readonly WorldDraftRecordDto[],
  rootReleaseIds: readonly string[],
  elements: readonly CompiledModelElement[],
  declaredDefinitionIds?: ReadonlySet<string>,
): void {
  const byKey = new Map(
    elements.map((element) => [element.lineage.key as string, element]),
  );
  const conceptIds = new Set(
    elements
      .filter((element) => element.lineage.kind === "concept")
      .map((element) => element.lineage.id as string),
  );
  for (const record of records) {
    if (
      declaredDefinitionIds &&
      record.resourceType === "definitions" &&
      !declaredDefinitionIds.has(record.sourceId)
    ) {
      continue;
    }
    if (!isObject(record.payload)) continue;
    const conformance = record.payload.conformance;
    const hasGovernedValues = "modelValues" in record.payload;
    const definitionType = governedDefinitionKind(
      record.resourceType,
      record.payload,
    );
    const expectedRole = definitionType
      ? `aow:${definitionType}`
      : record.resourceType === "world-placements"
        ? "aow:world-placement"
        : undefined;
    const matchingConcepts = expectedRole
      ? elements.filter(
          (element) =>
            element.lineage.kind === "concept" &&
            element.lineage.semanticRole === expectedRole,
        )
      : [];
    if (!isObject(conformance)) {
      if (hasGovernedValues || definitionType || matchingConcepts.length > 0)
        throw new BadRequestException(
          "A governed authored resource is missing Model Schema conformance.",
        );
      continue;
    }
    const selected = conformance.modelSchemaReleaseIds;
    if (
      !Array.isArray(selected) ||
      selected.length !== rootReleaseIds.length ||
      selected.some((id, index) => id !== rootReleaseIds[index])
    ) {
      throw new BadRequestException(
        "A governed authored resource does not conform to the draft's exact Model Schema releases.",
      );
    }
    if (
      typeof conformance.conceptId !== "string" ||
      !conceptIds.has(conformance.conceptId)
    ) {
      throw new BadRequestException(
        "A governed authored resource references an unavailable Model concept.",
      );
    }
    if (expectedRole) {
      if (
        matchingConcepts.length === 0 ||
        !matchingConcepts.some(
          ({ lineage }) => conformance.conceptId === lineage.id,
        )
      ) {
        throw new BadRequestException(
          "A governed authored resource uses the wrong Model concept.",
        );
      }
    }
    if (definitionType === "creature") {
      const components = isObject(record.payload.components)
        ? record.payload.components
        : record.payload;
      assertNumericModelValues(components.attributes, byKey, "aow:attribute");
      assertModelKeys(components.equipmentSlots, byKey, "aow:equipment-slot");
    }
    if (definitionType === "item") {
      const components = isObject(record.payload.components)
        ? record.payload.components
        : record.payload;
      const equippable = isObject(components.equippable)
        ? components.equippable
        : undefined;
      const compatibleSlots = Array.isArray(equippable?.compatibleSlotSets)
        ? flattenNestedValues(equippable.compatibleSlotSets)
        : Array.isArray(record.payload.compatibleEquipmentSlots)
          ? record.payload.compatibleEquipmentSlots
          : [];
      assertModelKeys(compatibleSlots, byKey, "aow:equipment-slot");
      const modelValues = isObject(record.payload.modelValues)
        ? record.payload.modelValues
        : {};
      const itemFamilyKey =
        modelValues["aow:item-family"] ?? record.payload.itemFamilyKey;
      if (
        typeof itemFamilyKey !== "string" ||
        byKey.get(itemFamilyKey)?.lineage.semanticRole !== "aow:item-family"
      ) {
        throw new BadRequestException(
          "An Item Definition must select an available Item family.",
        );
      }
    }
    if (definitionType === "skill") {
      const components = isObject(record.payload.components)
        ? record.payload.components
        : {};
      const defaultAttribute = components.defaultAttribute;
      if (
        defaultAttribute !== undefined &&
        (typeof defaultAttribute !== "string" ||
          byKey.get(defaultAttribute)?.lineage.semanticRole !== "aow:attribute")
      )
        throw new BadRequestException(
          "A Skill Definition must select an available default Attribute.",
        );
    }
    if (definitionType === "profession") {
      const components = isObject(record.payload.components)
        ? record.payload.components
        : {};
      const ranks = arrayValue(components.expertiseOrder);
      const rankReferences = [...ranks];
      for (const level of arrayValue(components.expertiseLevels))
        if (isObject(level)) rankReferences.push(level.tier);
      for (const rule of arrayValue(components.acquisition))
        if (isObject(rule)) rankReferences.push(rule.startingExpertise);
      for (const action of arrayValue(components.actions)) {
        if (!isObject(action)) continue;
        rankReferences.push(action.unlocksAt);
        for (const improvement of arrayValue(action.improvements))
          if (isObject(improvement))
            rankReferences.push(improvement.atExpertise);
      }
      if (
        ranks.length === 0 ||
        rankReferences.some(
          (rank) =>
            typeof rank !== "string" ||
            byKey.get(rank)?.lineage.semanticRole !== "aow:profession-rank",
        )
      )
        throw new BadRequestException(
          "A Profession Definition must select available Profession Ranks.",
        );
    }
  }
}

function flattenNestedValues(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  const result: unknown[] = [];
  for (const group of value as readonly unknown[]) {
    if (!Array.isArray(group)) continue;
    for (const entry of group as readonly unknown[]) result.push(entry);
  }
  return result;
}
function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function governedDefinitionKind(
  resourceType: string,
  payload: Record<string, unknown>,
): "creature" | "item" | "skill" | "profession" | "background" | undefined {
  if (resourceType !== "definitions") return undefined;
  if (
    payload.kind === "creature" ||
    payload.kind === "item" ||
    payload.kind === "skill" ||
    payload.kind === "profession" ||
    payload.kind === "background"
  )
    return payload.kind;
  // Explicit compatibility for records written before Definition.kind became authoritative.
  if (
    payload.kind === undefined &&
    (payload.definitionType === "creature" || payload.definitionType === "item")
  )
    return payload.definitionType;
  return undefined;
}
function assertNumericModelValues(
  value: unknown,
  byKey: ReadonlyMap<string, CompiledModelElement>,
  semanticRole: string,
): void {
  if (!isObject(value))
    throw new BadRequestException(
      "Creature Attributes must use the effective Model Schema.",
    );
  for (const [key, score] of Object.entries(value)) {
    const element = byKey.get(key);
    const metadata =
      isObject(element?.revision.payload) &&
      isObject(element.revision.payload.valueMetadata)
        ? element.revision.payload.valueMetadata
        : {};
    const minimum =
      typeof metadata["aow:minimum"] === "number" ? metadata["aow:minimum"] : 0;
    const maximum =
      typeof metadata["aow:maximum"] === "number"
        ? metadata["aow:maximum"]
        : 100;
    if (
      element?.lineage.semanticRole !== semanticRole ||
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < minimum ||
      score > maximum
    ) {
      throw new BadRequestException(
        "A Creature Attribute is unavailable or outside its allowed range.",
      );
    }
  }
}
function assertModelKeys(
  value: unknown,
  byKey: ReadonlyMap<string, CompiledModelElement>,
  semanticRole: string,
): void {
  if (
    !Array.isArray(value) ||
    new Set(value).size !== value.length ||
    value.some(
      (key) =>
        typeof key !== "string" ||
        byKey.get(key)?.lineage.semanticRole !== semanticRole,
    )
  ) {
    throw new BadRequestException(
      "A governed Definition references an unavailable Model option.",
    );
  }
}
function visible(value: string, message: string) {
  const v = value?.trim();
  if (!v) throw new BadRequestException(message);
  return v;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function notFound() {
  return new NotFoundException("The selected World Definition was not found.");
}
function unavailable() {
  return new ServiceUnavailableException(
    "World authoring is temporarily unavailable.",
  );
}
function staleDraft() {
  return new ConflictException(
    "The World draft changed; refresh before trying again.",
  );
}
function staleBase() {
  return new ConflictException(
    "The published World changed; refresh the draft before publishing.",
  );
}
function archivedConflict() {
  return new ConflictException(
    "Restore this archived World before editing or publishing it.",
  );
}
function isPrismaConflict(error: unknown) {
  return isObject(error) && (error.code === "P2002" || error.code === "P2034");
}
function isPrismaUniqueConflict(error: unknown) {
  return isObject(error) && error.code === "P2002";
}
