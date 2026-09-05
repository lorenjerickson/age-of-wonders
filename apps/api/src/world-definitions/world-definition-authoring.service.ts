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
  WorldDraftRecordDto,
} from "./dto/world-definition-authoring.dto";
import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";

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
    const content = dto.content ?? baseline.content;
    const records = normalizeRecords(dto.records ?? baseline.records);
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
  ) {
    const owned = await this.ownedDraft(worldDefinitionId, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    const records = normalizeRecords(dto.records);
    assertBoundedDraftJson(dto.content, records);
    const result = await this.prisma.worldDefinitionDraft.updateMany({
      where: {
        id: owned.draft.id,
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
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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
            payload: rewriteReferences(
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
    records: row.snapshotRecords,
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
        payload: { name, kind: "world", placement: { kind: "root" } },
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
export function assertGovernedRecordConformance(
  records: readonly WorldDraftRecordDto[],
  rootReleaseIds: readonly string[],
  elements: readonly CompiledModelElement[],
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
    if (!isObject(record.payload)) continue;
    const conformance = record.payload.conformance;
    const hasGovernedValues = "modelValues" in record.payload;
    const definitionType = governedDefinitionKind(
      record.resourceType,
      record.payload,
    );
    const expectedRole = definitionType === "creature"
      ? "aow:creature"
      : definitionType === "item"
        ? "aow:item"
        : record.resourceType === "world-placements"
          ? "aow:world-placement"
          : undefined;
    const matchingConcepts = expectedRole
      ? elements.filter((element) =>
          element.lineage.kind === "concept" &&
          element.lineage.semanticRole === expectedRole)
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
        !matchingConcepts.some(({ lineage }) =>
          conformance.conceptId === lineage.id)
      ) {
        throw new BadRequestException(
          "A governed authored resource uses the wrong Model concept.",
        );
      }
    }
    if (definitionType === "creature") {
      assertNumericModelValues(
        record.payload.attributes,
        byKey,
        "aow:attribute",
      );
      assertModelKeys(
        record.payload.equipmentSlots,
        byKey,
        "aow:equipment-slot",
      );
    }
    if (definitionType === "item") {
      assertModelKeys(
        record.payload.compatibleEquipmentSlots,
        byKey,
        "aow:equipment-slot",
      );
      if (
        typeof record.payload.itemFamilyKey !== "string" ||
        byKey.get(record.payload.itemFamilyKey)?.lineage.semanticRole !==
          "aow:item-family"
      ) {
        throw new BadRequestException(
          "An Item Definition must select an available Item family.",
        );
      }
    }
  }
}
function governedDefinitionKind(
  resourceType: string,
  payload: Record<string, unknown>,
): "creature" | "item" | undefined {
  if (resourceType !== "definitions") return undefined;
  if (payload.kind === "creature" || payload.kind === "item")
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
