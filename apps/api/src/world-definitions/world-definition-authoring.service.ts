import {
  DefinitionLineage,
  rewriteWorldDefinitionReferences as rewriteReferences,
} from "@aow/domain";
import {
  Map as DomainMap,
  WorldDefinition,
  LocationDefinition,
  CreatureDefinition,
  ItemDefinition,
  CharacterTemplate,
  SkillDefinition,
} from "@aow/domain";
import { worldAccessWhere } from "./world-access";
import { worldCodexSnapshotIssue } from "./world-codex-validation";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
import { worldRuleSnapshotIssue } from "./world-rule-snapshot";
import type {
  UploadTerrainChunkDto,
  SaveLocationTerrainDto,
} from "./dto/location-terrain.dto";
import {
  TERRAIN_CHUNK_RESOURCE,
  validateUploadedTerrainChunk,
  captureTerrainRecords,
  resolveTerrainManifest,
} from "./terrain-snapshot";
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
    const row = await this.ownedDraft(worldDefinitionId, userId, false);
    return draftResponse(row.draft);
  }

  async exportDraft(worldDefinitionId: string, userId: string) {
    const row = await this.ownedDraft(worldDefinitionId, userId, false);
    return {
      revisionName: row.draft.revisionName,
      storageRevision: row.draft.storageRevision,
      content: row.draft.content,
      // The editor projection omits terrain payloads; a portable export must retain them.
      records: readRecords(row.draft.snapshotRecords),
    };
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
      where: { id: worldId, ...worldAccessWhere(userId, true) },
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
    const owned = await this.ownedDraft(worldId, userId, false);
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
    const owned = await this.ownedDraft(worldId, userId, false);
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
    const issue = DomainMap.mapIssue(dto.map);
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
    const locationOwner = LocationDefinition.deserializePayload(
      location.payload,
      {
        records,
        baseline: location.payload,
        mode: "draft",
        rootLocationId: stringValue(owned.draft.content, "rootLocationId"),
      },
    );
    let payload: Record<string, unknown>;
    try {
      const changed = await locationOwner.map.replace(dto.map, userId);
      if (changed.status === "rejected")
        throw new BadRequestException(
          "The map change would invalidate this Location.",
        );
      payload = locationOwner.serializePayload();
    } finally {
      locationOwner.dispose();
    }
    const locationIssue = canonicalWorldRecordIssue(
      "locations",
      locationId,
      payload,
      location.payload,
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
              worldDefinition: {
                status: "ACTIVE",
                ...worldAccessWhere(userId, true),
              },
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
    const content = WorldDefinition.withMember(
      objectValue(owned.draft.content),
      "definitionIds",
      id,
    );
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

  async deleteAuthoredRecord(
    worldId: string,
    userId: string,
    kind:
      | "locations"
      | "creature"
      | "item"
      | "skill"
      | "profession"
      | "background"
      | "monster"
      | "character-template",
    id: string,
    expected: { expectedDraftId: string; expectedStorageRevision: number },
  ) {
    const owned = await this.ownedDraft(worldId, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (
      owned.draft.id !== expected.expectedDraftId ||
      owned.draft.storageRevision !== expected.expectedStorageRevision
    )
      throw staleDraft();
    const records = readRecords(owned.draft.snapshotRecords);
    const resourceType = kind === "locations" ? "locations" : "definitions";
    const record = records.find(
      (r) =>
        r.resourceType === resourceType &&
        r.sourceId === id &&
        (kind === "locations" || objectValue(r.payload).kind === kind),
    );
    if (!record) throw worldRecordNotFound();
    if (
      kind === "locations" &&
      stringValue(owned.draft.content, "rootLocationId") === id
    )
      throw new ConflictException("The World root Location cannot be deleted.");
    const remaining = records.filter((r) => r !== record);
    const references = (value: unknown): boolean =>
      value === id ||
      (Array.isArray(value)
        ? value.some(references)
        : isObject(value) && Object.values(value).some(references));
    if (
      remaining.some((r) => {
        if (r.resourceType === "location-connections") return false;
        if (r.resourceType !== "locations") return references(r.payload);
        const location = LocationDefinition.deserializePayload(r.payload);
        try {
          return location.references(id);
        } finally {
          location.dispose();
        }
      }) ||
      worldCodexSnapshotIssue(remaining, records)
    )
      throw new ConflictException(
        "This entry is still used in the World. Remove its references before deleting it.",
      );
    const membership = kind === "locations" ? "locationIds" : "definitionIds";
    const content = WorldDefinition.withoutMember(
      objectValue(owned.draft.content),
      membership,
      id,
    );
    return this.persistDraft(
      worldId,
      owned.draft,
      {
        ...expected,
        revisionName: owned.draft.revisionName,
        content,
        records: remaining,
      },
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
      const hierarchyIssue = WorldDefinition.hierarchyPlacementIssue(
        owned.draft.content,
        records,
        id,
        location.parentLocationId,
      );
      if (hierarchyIssue) throw new BadRequestException(hierarchyIssue);
      if (location.image) {
        const prior = objectValue(existing?.payload).image;
        const preserved = LocationDefinition.preservedArtwork(
          location.image,
          prior,
        );
        if (preserved) {
          location.image = preserved;
        } else {
          const asset =
            typeof location.image.assetId === "string"
              ? await this.prisma.mediaAsset.findFirst({
                  where: {
                    id: location.image.assetId,
                    OR: [
                      { createdByUserId: userId },
                      { createdByUserId: null },
                      {
                        scopeType: "world-definition",
                        scopeId: worldDefinitionId,
                      },
                    ],
                    mimeType: { startsWith: "image/" },
                  },
                })
              : null;
          if (!asset)
            throw new BadRequestException(
              "The selected Location image is unavailable.",
            );
          location.image = LocationDefinition.verifiedArtwork(
            location.image,
            asset.mimeType,
          );
        }
      }
      const presentationIssue = LocationDefinition.presentationIssue(
        {
          ...(location.weather == null ? {} : { weather: location.weather }),
          ...(location.audiovisualEffects == null
            ? {}
            : { audiovisualEffects: location.audiovisualEffects }),
        },
        objectValue(existing?.payload),
      );
      if (presentationIssue) throw new BadRequestException(presentationIssue);
      if (
        location.audiovisualEffects &&
        JSON.stringify(location.audiovisualEffects) !==
          JSON.stringify(objectValue(existing?.payload).audiovisualEffects)
      ) {
        const previousCues = objectValue(existing?.payload).audiovisualEffects;
        location.audiovisualEffects = await Promise.all(
          location.audiovisualEffects.map(async (cue) => {
            const prior = Array.isArray(previousCues)
              ? previousCues.some(
                  (value) =>
                    isObject(value) &&
                    value.id === cue.id &&
                    value.assetId === cue.assetId &&
                    value.kind === cue.kind,
                )
              : undefined;
            if (!prior) {
              const asset = await this.prisma.mediaAsset.findFirst({
                where: {
                  id: cue.assetId,
                  OR: [
                    { createdByUserId: userId },
                    { createdByUserId: null },
                    {
                      scopeType: "world-definition",
                      scopeId: worldDefinitionId,
                    },
                  ],
                },
              });
              if (
                !asset ||
                (cue.kind === "audio"
                  ? !asset.mimeType.startsWith("audio/")
                  : !/^(image|video)\//.test(asset.mimeType))
              )
                throw new BadRequestException(
                  "Choose available media matching the audiovisual cue type.",
                );
            }
            const clean = { ...cue } as unknown as Record<string, unknown>;
            delete clean.uri;
            return clean as unknown as import("@aow/common").LocationAudiovisualEffect;
          }),
        );
      }
      payload = worldLocationPayload(
        id,
        {
          name: visible(location.name, "A Location name is required."),
          description: location.description,
          kind: isRoot ? "world" : location.kind,
          ...(isRoot ? {} : { parentLocationId: location.parentLocationId }),
          gmDescription: location.gmDescription,
          weather: location.weather,
          audiovisualEffects: location.audiovisualEffects,
          discoveries: location.discoveries,
          map: location.map,
          mapSceneGrid: location.mapSceneGrid,
          grantedConditions: location.grantedConditions,
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
        try {
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
        } catch (error) {
          if (error instanceof TypeError)
            throw new BadRequestException(error.message);
          throw error;
        }
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
    if (kind === "locations") {
      const entity = LocationDefinition.deserializePayload(payload, {
        sourceId: id,
        records,
        baseline: existing?.payload,
        mode: "draft",
        rootLocationId: stringValue(owned.draft.content, "rootLocationId"),
      });
      try {
        const issue = entity.state.metadata.validity.issues.find(
          (issue) => issue.blocking !== false && !issue.unresolved,
        );
        if (issue) throw new BadRequestException(issue.message);
      } finally {
        entity.dispose();
      }
      const map = objectValue(objectValue(payload).map);
      if (map.kind === "isometric") {
        // Referenced chunks must already belong to this authorized draft. Uploaded chunks
        // are attached through the terrain save endpoint, which checks their receipt/hash.
        resolveTerrainManifest(
          map as unknown as import("@aow/common").IsometricTerrainManifest,
          records,
        );
      }
    }
    const grantIssue =
      kind === "creature"
        ? CreatureDefinition.deserializePayload(payload, {
            sourceId: id,
            records,
          }).state.metadata.validity.issues.find(
            (issue) => issue.code === "creature-codex-conditions",
          )?.message
        : kind === "item"
          ? itemGrantedConditionIssue(
              payload,
              id,
              records,
              dto as UpsertWorldItemDraftDto,
            )
          : undefined;
    if (grantIssue) throw new BadRequestException(grantIssue);
    const issue = canonicalWorldRecordIssue(
      resourceType,
      id,
      payload,
      kind === "locations" ? existing?.payload : undefined,
    );
    if (issue) throw new BadRequestException(issue);
    if (authoredModel) {
      assertGovernedRecordConformance(
        [{ resourceType, sourceId: id, payload }],
        authoredModel.releaseIds,
        authoredModel.elements,
        undefined,
        "draft",
      );
    }
    const nextRecords = [
      ...records.filter(
        (record) =>
          !(record.resourceType === resourceType && record.sourceId === id),
      ),
      { resourceType, sourceId: id, payload },
    ];
    const codexIssue = worldCodexSnapshotIssue(nextRecords, records);
    if (codexIssue) throw new BadRequestException(codexIssue);
    const membership = kind === "locations" ? "locationIds" : "definitionIds";
    const content = WorldDefinition.withMember(
      objectValue(owned.draft.content),
      membership,
      id,
    );
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
    const worldOwner = await this.prisma.worldDefinition.findUnique({
      where: { id: worldDefinitionId },
      select: { ownerUserId: true },
    });
    const effective = await this.models.resolveEffectiveRoots(
      releaseIds,
      worldOwner?.ownerUserId ?? userId,
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
    let artwork: ReturnType<typeof CreatureDefinition.decodeArtworkViews>;
    try {
      artwork = CreatureDefinition.decodeArtworkViews(dto.images);
    } catch (error) {
      if (error instanceof TypeError)
        throw new BadRequestException(error.message);
      throw error;
    }
    for (const [role, value] of Object.entries(artwork)) {
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
    if (dto.image === undefined) return dto;
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
    authoredCodex = false,
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
    if (
      canonicalJsonHash(modelReleaseIds(dto.content)) !==
      canonicalJsonHash(modelReleaseIds(owned.draft.content))
    )
      throw new BadRequestException(
        "World model definitions are read only. Preserve the currently adopted Model releases.",
      );
    const records = normalizeRecords([
      ...dto.records,
      ...readRecords(owned.draft.snapshotRecords).filter(
        (r) => r.resourceType === TERRAIN_CHUNK_RESOURCE,
      ),
    ]);
    const codexRecords = (entries: readonly WorldDraftRecordDto[]) =>
      entries.filter((r) =>
        (Object.values(WORLD_CODEX_RESOURCES) as readonly string[]).includes(
          r.resourceType,
        ),
      );
    if (
      !authoredCodex &&
      canonicalJsonHash(codexRecords(records)) !==
        canonicalJsonHash(
          codexRecords(readRecords(owned.draft.snapshotRecords)),
        )
    )
      throw new BadRequestException(
        "Edit Characters, Conditions and Effects through the World Codex workspace.",
      );
    const codexIssue = worldCodexSnapshotIssue(
      records,
      readRecords(owned.draft.snapshotRecords),
    );
    if (codexIssue) throw new BadRequestException(codexIssue);
    for (const record of records.filter(
      (r) => r.resourceType === "world-character-templates",
    )) {
      const previous = readRecords(owned.draft.snapshotRecords).find(
        (r) =>
          r.resourceType === record.resourceType &&
          r.sourceId === record.sourceId,
      );
      const entity = CharacterTemplate.deserializePayload(record.payload, {
        records,
        baseline: previous?.payload,
      });
      try {
        const issue = entity.state.metadata.validity.issues.find(
          (issue) => issue.blocking !== false,
        );
        if (issue) throw new BadRequestException(issue.message);
      } finally {
        entity.dispose();
      }
    }
    const ruleIssue = worldRuleSnapshotIssue(records);
    if (ruleIssue) throw new BadRequestException(ruleIssue);
    if (
      !authoredRules &&
      canonicalJsonHash(
        records.filter((r) => r.resourceType === "world-rules"),
      ) !==
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
        !["profession", "skill", "background"].includes(
          String(record.payload.kind),
        )
      )
        continue;
      const issue =
        record.payload.kind === "skill"
          ? skillComponentIssue(record.payload)
          : canonicalWorldRecordIssue(
              "definitions",
              record.sourceId,
              record.payload,
            );
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
        worldDefinition: {
          status: "ACTIVE",
          ...worldAccessWhere(userId, true),
        },
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
          owned.ownerUserId ?? userId,
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
        worldDefinition: {
          status: "ACTIVE",
          ...worldAccessWhere(userId, true),
        },
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
          const draft = world.draft;
          const lineage = DefinitionLineage.deserializePayload({
            status: world.status,
            currentRevisionId: world.currentRevisionId,
            revisionNumber: world.currentRevision?.revisionNumber ?? 0,
          });
          const evidence = {
            expectedStorageRevision: dto.expectedStorageRevision,
            storageRevision: draft.storageRevision,
            baseRevisionId: draft.baseRevisionId ?? null,
            validationStatus: draft.validationStatus,
            validatedStorageRevision: draft.validatedStorageRevision,
          };
          const issue = DefinitionLineage.publicationIssue(
            lineage.state.data,
            evidence,
          );
          if (issue) {
            lineage.dispose();
            if (issue === "archived") throw archivedConflict();
            if (issue === "stale-draft") throw staleDraft();
            if (issue === "stale-base") throw staleBase();
            throw new BadRequestException(
              "Validate this exact World draft revision before publishing it.",
            );
          }
          const revisionId = randomUUID();
          let nextRevisionNumber: number;
          try {
            await lineage.command("publish", {
              initiator: userId,
              params: { ...evidence, revisionId },
              context: {},
            });
            nextRevisionNumber = lineage.state.data.revisionNumber;
          } finally {
            lineage.dispose();
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
          const revisionNumber = nextRevisionNumber;
          const revision = await tx.worldDefinitionRevision.create({
            data: {
              id: revisionId,
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
          const mapping: Record<string, Record<string, string>> = {};
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
        status: await DefinitionLineage.archiveStatus(archived, userId),
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

  private async ownedDraft(id: string, userId: string, write = true) {
    let row;
    try {
      row = await this.prisma.worldDefinition.findUnique({
        where: { id, ...worldAccessWhere(userId, write) },
        select: {
          id: true,
          status: true,
          metadataRevision: true,
          ownerUserId: true,
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
    records: readRecords(row.snapshotRecords).filter(
      (r) => r.resourceType !== TERRAIN_CHUNK_RESOURCE,
    ),
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
    content: WorldDefinition.createContent(rootLocationId, [
      CORE_MODEL_SCHEMA_RELEASE_ID,
    ]),
    records: [
      {
        resourceType: "locations",
        sourceId: rootLocationId,
        payload: worldLocationPayload(rootLocationId, { name, kind: "world" }),
      },
    ],
  };
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
function modelReleaseIds(value: unknown): string[] {
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
      if (isObject(record.payload) && record.payload.image === undefined)
        return undefined;
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
  ...args: Parameters<typeof WorldDefinition.assertGovernedConformance>
): void {
  try {
    WorldDefinition.assertGovernedConformance(...args);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : "Invalid Model conformance.",
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

/** Preserve the draft-save diagnostic while policy stays inside SkillDefinition. */
function skillComponentIssue(payload: unknown): string | undefined {
  const entity = SkillDefinition.deserializePayload(payload);
  try {
    return entity.state.metadata.validity.issues.find(
      (issue) => issue.code === "skill-canonical-components",
    )?.message;
  } finally {
    entity.dispose();
  }
}

/** Validate explicitly edited owned content without blocking repairs to unrelated legacy content. */
function itemGrantedConditionIssue(
  payload: unknown,
  sourceId: string,
  records: readonly {
    resourceType: string;
    sourceId: string;
    payload: unknown;
  }[],
  input: UpsertWorldItemDraftDto,
): string | undefined {
  const entity = ItemDefinition.deserializePayload(payload, {
    sourceId,
    records,
  });
  try {
    return entity.state.metadata.validity.issues.find(
      (issue) =>
        issue.code === "item-codex-conditions" ||
        (issue.blocking !== false &&
          !issue.unresolved &&
          ((input.slottedContainer !== undefined &&
            issue.code === "item-codex-storage-invalid") ||
            (input.beltSlotCategory !== undefined &&
              issue.code === "item-codex-belt-category-invalid") ||
            (input.rarity !== undefined &&
              issue.code === "item-codex-rarity-invalid") ||
            (input.traits !== undefined &&
              issue.code.startsWith("item-traits-")) ||
            (input.actions !== undefined &&
              issue.code.startsWith("item-actions-")) ||
            (input.vehicle !== undefined &&
              issue.code.startsWith("item-vehicle-")))),
    )?.message;
  } finally {
    entity.dispose();
  }
}
