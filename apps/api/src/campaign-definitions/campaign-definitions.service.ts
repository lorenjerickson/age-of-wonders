import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  buildSnapshotManifest, canonicalJsonHash, isCanonicalSnapshotManifest,
  isPublicationJson, type CanonicalSnapshotManifest,
} from "../domain/snapshot-manifest";
import { ModelRegistryService } from "../model-registry/model-registry.service";
import type { CompiledModelElement } from "../model-registry/model-registry-compiler";
import { PrismaService } from "../prisma/prisma.service";
import { assertGovernedRecordConformance } from "../world-definitions/world-definition-authoring.service";
import {
  isSafeCampaignRichText, validateCampaignDefinitionDraft, type CampaignDraftRecord,
} from "./campaign-definition-draft-validator";
import type {
  ApplyCampaignWorldMigrationDto, CreateCampaignDefinitionDto,
  ExpectedCampaignDraftRevisionDto, ExpectedCampaignMetadataRevisionDto,
  ForkCampaignDefinitionDto, PreviewCampaignWorldMigrationDto,
  ResetCampaignDraftDto, SaveCampaignDraftDto, StartCampaignDraftDto,
} from "./dto/campaign-definition-write.dto";

const RESERVED_RECORD = "campaign-definition-revision";
const MAX_DRAFT_BYTES = 5 * 1024 * 1024;
export const MAX_MIGRATION_CONFLICTS = 50;
export const MAX_MIGRATION_CANDIDATES_PER_CONFLICT = 12;
export const MAX_MIGRATION_CHANGES_PER_KIND = 50;
export const MAX_MIGRATION_PREVIEW_BYTES = 128 * 1024;

const worldSnapshotSelect = {
  id: true, worldDefinitionId: true, worldDefinitionRevisionId: true,
  manifest: true, contentHash: true, capturedAt: true,
  worldDefinitionRevision: {
    select: {
      id: true, revisionNumber: true, predecessorRevisionId: true,
      name: true, publishedAt: true,
      worldDefinition: { select: { name: true, ownerUserId: true } },
      modelSchemaSelections: {
        select: {
          modelSchemaReleaseId: true,
          modelSchemaRelease: {
            select: {
              name: true,
              revisionNumber: true,
              registry: { select: { name: true } },
            },
          },
        },
        orderBy: { selectionOrder: "asc" },
      },
      successorRevisions: {
        select: {
          revisionNumber: true,
          snapshots: {
            select: { id: true },
            orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
            take: 1,
          },
        },
        orderBy: [{ revisionNumber: "asc" }, { id: "asc" }],
      },
    },
  },
} as const satisfies Prisma.WorldDefinitionSnapshotSelect;

const draftSelect = {
  id: true, campaignDefinitionId: true, worldDefinitionId: true,
  baseRevisionId: true, baseSnapshotId: true, capturedWorldSnapshotId: true,
  revisionName: true, content: true, snapshotRecords: true,
  storageRevision: true, validationStatus: true,
  validatedStorageRevision: true, validationReport: true,
  createdAt: true, updatedAt: true,
  capturedWorldSnapshot: { select: worldSnapshotSelect },
} as const satisfies Prisma.CampaignDefinitionDraftSelect;

const listSelect = {
  id: true, name: true, description: true, status: true, archivedAt: true,
  metadataRevision: true, updatedAt: true,
  draft: { select: { storageRevision: true, validationStatus: true, validatedStorageRevision: true, revisionName: true } },
  currentRevision: {
    select: {
      id: true, revisionNumber: true, name: true, contentHash: true,
      sourceDraftRevision: true, publishedAt: true,
      capturedWorldSnapshot: { select: worldSnapshotSelect },
    },
  },
} as const satisfies Prisma.CampaignDefinitionSelect;

const detailSelect = {
  id: true, name: true, description: true, status: true, archivedAt: true,
  metadataRevision: true, currentRevisionId: true, createdAt: true, updatedAt: true,
  draft: { select: draftSelect },
  revisions: {
    select: {
      id: true, revisionNumber: true, predecessorRevisionId: true, name: true,
      contentHash: true, publishedAt: true, capturedWorldSnapshot: { select: worldSnapshotSelect },
      snapshots: { select: { id: true, contentHash: true, capturedAt: true } },
    },
    orderBy: [{ revisionNumber: "desc" as const }, { id: "asc" as const }],
  },
} as const satisfies Prisma.CampaignDefinitionSelect;

@Injectable()
export class CampaignDefinitionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ModelRegistryService)
    private readonly models: Pick<ModelRegistryService, "resolveEffectiveRootsForCampaign"> = {
      resolveEffectiveRootsForCampaign: () => Promise.resolve({ roots: [], elements: [] }),
    },
  ) {}

  async list(userId: string) {
    try {
      const rows = await this.prisma.campaignDefinition.findMany({
        where: { ownerUserId: userId }, select: listSelect,
        orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
      });
      return { items: rows.map(listResponse), total: rows.length };
    } catch { throw unavailable(); }
  }

  async get(id: string, userId: string) {
    try {
      const row = await this.prisma.campaignDefinition.findUnique({
        where: { id, ownerUserId: userId }, select: detailSelect,
      });
      if (!row) throw notFound();
      return detailResponse(row);
    } catch (error) { this.rethrow(error); }
  }

  async create(dto: CreateCampaignDefinitionDto, userId: string) {
    const name = visible(dto.name, "A Campaign Definition name is required.");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const world = await ownedWorldSnapshot(tx, dto.worldDefinitionSnapshotId, userId);
        const campaignId = randomUUID();
        const content = newCampaignContent();
        const campaign = await tx.campaignDefinition.create({
          data: {
            id: campaignId, worldDefinitionId: world.worldDefinitionId, name,
            description: dto.description?.trim() || null, ownerUserId: userId,
          },
          select: { id: true, name: true, description: true, metadataRevision: true },
        });
        const draft = await tx.campaignDefinitionDraft.create({
          data: {
            campaignDefinitionId: campaign.id,
            worldDefinitionId: world.worldDefinitionId,
            capturedWorldSnapshotId: world.id, revisionName: name,
            content: jsonObject(content), snapshotRecords: [],
            createdByUserId: userId, updatedByUserId: userId,
          }, select: draftSelect,
        });
        return { ...campaign, description: campaign.description ?? undefined, draft: draftResponse(draft) };
      }, serializable);
    } catch (error) { this.rethrow(error); }
  }

  async getDraft(id: string, userId: string) {
    return draftResponse((await this.ownedDraft(id, userId)).draft);
  }

  async startDraft(id: string, dto: StartCampaignDraftDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.campaignDefinition.findUnique({
          where: { id, ownerUserId: userId },
          select: {
            status: true, currentRevisionId: true, draft: { select: draftSelect },
            currentRevision: {
              select: {
                id: true, name: true, content: true, capturedWorldSnapshotId: true,
                snapshots: { select: { id: true, manifest: true }, take: 1 },
              },
            },
          },
        });
        if (!campaign) throw notFound();
        if (campaign.status !== "ACTIVE") throw archivedConflict();
        if (campaign.draft) return draftResponse(campaign.draft);
        if (!campaign.currentRevision || campaign.currentRevisionId !== dto.baseRevisionId)
          throw staleBase();
        const snapshot = campaign.currentRevision.snapshots[0];
        if (!snapshot || !isCanonicalSnapshotManifest(snapshot.manifest))
          throw new BadRequestException("The selected Campaign revision cannot seed a draft.");
        const records = snapshot.manifest.records.filter((record) => record.resourceType !== RESERVED_RECORD)
          .map(({ resourceType, sourceId, sourceRevision, payload }) => ({
            resourceType, sourceId, ...(sourceRevision ? { sourceRevision } : {}), payload,
          }));
        const draft = await tx.campaignDefinitionDraft.create({
          data: {
            campaignDefinitionId: id,
            worldDefinitionId: (await ownedWorldSnapshot(tx, campaign.currentRevision.capturedWorldSnapshotId, userId)).worldDefinitionId,
            baseRevisionId: campaign.currentRevision.id, baseSnapshotId: snapshot.id,
            capturedWorldSnapshotId: campaign.currentRevision.capturedWorldSnapshotId,
            revisionName: campaign.currentRevision.name,
            content: jsonValue(campaign.currentRevision.content), snapshotRecords: jsonArray(records),
            createdByUserId: userId, updatedByUserId: userId,
          }, select: draftSelect,
        });
        return draftResponse(draft);
      }, serializable);
    } catch (error) {
      if (isPrismaConflict(error)) return this.getDraft(id, userId);
      this.rethrow(error);
    }
  }

  async save(id: string, dto: SaveCampaignDraftDto, userId: string) {
    const owned = await this.ownedDraft(id, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    const records = normalizeRecords(dto.records);
    assertBounded(dto.content, records);
    if (!safeRichTextFields(dto.content)) {
      throw new BadRequestException(
        "Campaign premise and introduction must use safe constrained rich text.",
      );
    }
    const changed = await this.prisma.campaignDefinitionDraft.updateMany({
      where: { id: owned.draft.id, storageRevision: dto.expectedStorageRevision },
      data: {
        revisionName: visible(dto.revisionName, "A revision name is required."),
        content: jsonObject(dto.content), snapshotRecords: jsonArray(records),
        storageRevision: { increment: 1 }, validationStatus: "NOT_VALIDATED",
        validatedStorageRevision: null, validationReport: Prisma.DbNull,
        updatedByUserId: userId, updatedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw staleDraft();
    return this.getDraft(id, userId);
  }

  async resetDraft(id: string, dto: ResetCampaignDraftDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.campaignDefinition.findUnique({
          where: { id, ownerUserId: userId },
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
                capturedWorldSnapshotId: true,
                snapshots: {
                  select: { id: true, manifest: true },
                  orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
                  take: 1,
                },
              },
            },
          },
        });
        if (!campaign?.draft) throw notFound();
        if (campaign.status !== "ACTIVE") throw archivedConflict();
        if (campaign.draft.storageRevision !== dto.expectedStorageRevision)
          throw staleDraft();
        if (
          !campaign.currentRevision ||
          campaign.currentRevisionId !== campaign.draft.baseRevisionId
        ) {
          throw staleBase();
        }
        const snapshot = campaign.currentRevision.snapshots[0];
        if (!snapshot || !isCanonicalSnapshotManifest(snapshot.manifest)) {
          throw new BadRequestException(
            "The published Campaign base cannot restore this draft.",
          );
        }
        const authoritative = snapshot.manifest.records.find(
          (record) => record.resourceType === RESERVED_RECORD,
        );
        if (
          !authoritative ||
          authoritative.sourceId !== campaign.currentRevision.id ||
          authoritative.sourceRevision !== campaign.currentRevision.revisionNumber ||
          canonicalJsonHash(authoritative.payload) !==
            canonicalJsonHash(campaign.currentRevision.content)
        ) {
          throw new BadRequestException(
            "The published Campaign base cannot restore this draft.",
          );
        }
        const records = snapshot.manifest.records
          .filter((record) => record.resourceType !== RESERVED_RECORD)
          .map(({ resourceType, sourceId, sourceRevision, payload }) => ({
            resourceType,
            sourceId,
            ...(sourceRevision === undefined ? {} : { sourceRevision }),
            payload,
          }));
        const changed = await tx.campaignDefinitionDraft.updateMany({
          where: {
            id: campaign.draft.id,
            storageRevision: dto.expectedStorageRevision,
          },
          data: {
            baseRevisionId: campaign.currentRevision.id,
            baseSnapshotId: snapshot.id,
            capturedWorldSnapshotId:
              campaign.currentRevision.capturedWorldSnapshotId,
            revisionName: campaign.currentRevision.name,
            content: jsonValue(campaign.currentRevision.content),
            snapshotRecords: jsonArray(records),
            storageRevision: { increment: 1 },
            validationStatus: "NOT_VALIDATED",
            validatedStorageRevision: null,
            validationReport: Prisma.DbNull,
            updatedByUserId: userId,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1) throw staleDraft();
        const restored = await tx.campaignDefinitionDraft.findUnique({
          where: { id: campaign.draft.id },
          select: draftSelect,
        });
        if (!restored) throw notFound();
        return draftResponse(restored);
      }, serializable);
    } catch (error) { this.rethrow(error); }
  }

  async validate(id: string, dto: ExpectedCampaignDraftRevisionDto, userId: string) {
    const owned = await this.ownedDraft(id, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (owned.draft.storageRevision !== dto.expectedStorageRevision) throw staleDraft();
    const report = await this.validationReport(owned.draft, userId);
    const changed = await this.prisma.campaignDefinitionDraft.updateMany({
      where: { id: owned.draft.id, storageRevision: dto.expectedStorageRevision },
      data: {
        validationStatus: report.valid ? "VALID" : "BLOCKED",
        validatedStorageRevision: dto.expectedStorageRevision,
        validationReport: jsonObject(report),
      },
    });
    if (changed.count !== 1) throw staleDraft();
    return report;
  }

  async publish(id: string, dto: ExpectedCampaignDraftRevisionDto, userId: string) {
    return this.publishTransaction(id, dto.expectedStorageRevision, userId);
  }

  async archive(id: string, dto: ExpectedCampaignMetadataRevisionDto, userId: string) {
    return this.setArchived(id, dto.expectedMetadataRevision, userId, true);
  }

  async restore(id: string, dto: ExpectedCampaignMetadataRevisionDto, userId: string) {
    return this.setArchived(id, dto.expectedMetadataRevision, userId, false);
  }

  async fork(sourceId: string, dto: ForkCampaignDefinitionDto, userId: string) {
    const name = visible(dto.name, "A fork name is required.");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const source = await tx.campaignDefinitionSnapshot.findFirst({
          where: {
            id: dto.sourceSnapshotId, campaignDefinitionId: sourceId,
            campaignDefinitionRevision: { campaignDefinition: { ownerUserId: userId } },
          },
          select: {
            id: true, campaignDefinitionId: true, capturedWorldSnapshotId: true,
            manifest: true,
            campaignDefinitionRevision: {
              select: { name: true, content: true, worldDefinitionId: true },
            },
          },
        });
        if (!source || !isCanonicalSnapshotManifest(source.manifest)) throw notFound();
        const targetId = randomUUID();
        const sourceRecords = source.manifest.records.filter((r) => r.resourceType !== RESERVED_RECORD);
        const mapping: Record<string, Record<string, string>> = {};
        for (const record of sourceRecords)
          (mapping[record.resourceType] ??= {})[record.sourceId] = randomUUID();
        const records = sourceRecords.map((record) => ({
          resourceType: record.resourceType,
          sourceId: mapping[record.resourceType]?.[record.sourceId] ?? record.sourceId,
          ...(record.sourceRevision ? { sourceRevision: record.sourceRevision } : {}),
          payload: rewriteCampaignReferences(record.payload, mapping, targetId, record.resourceType),
        }));
        const campaign = await tx.campaignDefinition.create({
          data: {
            id: targetId, worldDefinitionId: source.campaignDefinitionRevision.worldDefinitionId,
            name, description: dto.description?.trim() || null, ownerUserId: userId,
          }, select: { id: true, name: true, description: true, metadataRevision: true },
        });
        const draft = await tx.campaignDefinitionDraft.create({
          data: {
            campaignDefinitionId: targetId,
            worldDefinitionId: source.campaignDefinitionRevision.worldDefinitionId,
            capturedWorldSnapshotId: source.capturedWorldSnapshotId,
            revisionName: name,
            content: jsonValue(rewriteCampaignReferences(source.campaignDefinitionRevision.content, mapping, targetId)),
            snapshotRecords: jsonArray(records), createdByUserId: userId, updatedByUserId: userId,
          }, select: draftSelect,
        });
        await tx.campaignDefinitionForkProvenance.create({
          data: {
            targetCampaignDefinitionId: targetId, sourceCampaignDefinitionId: sourceId,
            sourceSnapshotId: source.id, identityMapping: jsonObject(mapping), createdByUserId: userId,
          },
        });
        return { ...campaign, description: campaign.description ?? undefined, draft: draftResponse(draft), forkedFrom: { revisionName: source.campaignDefinitionRevision.name } };
      }, serializable);
    } catch (error) { this.rethrow(error); }
  }

  async impact(id: string, userId: string) {
    const owned = await this.ownedDraft(id, userId);
    const instances = await this.prisma.campaignInstance.findMany({
      where: { campaignDefinitionId: id, createdByUserId: userId },
      select: { name: true, status: true }, orderBy: { name: "asc" },
    });
    const base = owned.draft.baseSnapshotId
      ? await this.prisma.campaignDefinitionSnapshot.findUnique({
          where: { id: owned.draft.baseSnapshotId }, select: { manifest: true },
        }) : null;
    const prior = base && isCanonicalSnapshotManifest(base.manifest)
      ? base.manifest.records.filter((r) => r.resourceType !== RESERVED_RECORD) : [];
    return {
      draftStorageRevision: owned.draft.storageRevision,
      changes: compareRecords(prior, readRecords(owned.draft.snapshotRecords)),
      downstreamInstances: instances.map((instance) => ({ name: instance.name, status: instance.status.toLowerCase() })),
    };
  }

  async previewWorldMigration(id: string, dto: PreviewCampaignWorldMigrationDto, userId: string) {
    const owned = await this.ownedDraft(id, userId);
    if (owned.status !== "ACTIVE") throw archivedConflict();
    if (owned.draft.storageRevision !== dto.expectedStorageRevision) throw staleDraft();
    await this.assertNoUnpublishedEdits(owned.draft);
    const target = await ownedWorldSnapshot(this.prisma, dto.targetWorldDefinitionSnapshotId, userId);
    const modelMigration = await this.assessModelMigration(owned.draft, target, userId);
    return buildCampaignWorldMigrationPlan(
      owned.draft,
      target,
      dto.mappings ?? [],
      {
        conflictOffset: dto.conflictOffset,
        candidateOffset: dto.candidateOffset,
        impactOffset: dto.impactOffset,
        changeOffset: dto.changeOffset,
        modelMigration,
      },
    );
  }

  async applyWorldMigration(id: string, dto: ApplyCampaignWorldMigrationDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.campaignDefinitionWorldMigrationAudit.findUnique({
          where: {
            campaignDefinitionId_sourceDraftRevision: {
              campaignDefinitionId: id,
              sourceDraftRevision: dto.expectedStorageRevision,
            },
            campaignDefinition: { ownerUserId: userId },
          },
          select: {
            planHash: true,
            resultCampaignRevision: {
              select: {
                ...revisionWriteSelect,
                snapshots: {
                  select: { id: true, contentHash: true, capturedAt: true },
                  take: 1,
                },
                capturedWorldSnapshot: { select: worldSnapshotSelect },
              },
            },
          },
        });
        if (prior) {
          if (prior.planHash !== dto.expectedPlanHash)
            throw new ConflictException("The World migration preview changed; preview it again.");
          const snapshot = prior.resultCampaignRevision.snapshots[0];
          if (!snapshot) throw unavailable();
          return publicationResponse(
            prior.resultCampaignRevision,
            snapshot,
            prior.resultCampaignRevision.capturedWorldSnapshot,
          );
        }
        const campaign = await tx.campaignDefinition.findUnique({
          where: { id, ownerUserId: userId },
          select: { status: true, currentRevisionId: true, draft: { select: draftSelect }, currentRevision: { select: { revisionNumber: true } } },
        });
        if (!campaign?.draft) throw notFound();
        if (campaign.status !== "ACTIVE") throw archivedConflict();
        const draft = campaign.draft;
        if (draft.storageRevision !== dto.expectedStorageRevision) throw staleDraft();
        if (draft.baseRevisionId !== campaign.currentRevisionId || !draft.baseRevisionId || !draft.baseSnapshotId)
          throw staleBase();
        await this.assertNoUnpublishedEdits(draft, tx);
        const target = await ownedWorldSnapshot(tx, dto.targetWorldDefinitionSnapshotId, userId);
        const modelMigration = await this.assessModelMigration(draft, target, userId);
        const plan = buildCampaignWorldMigrationPlan(
          draft,
          target,
          dto.mappings ?? [],
          { internal: true, modelMigration },
        );
        if (plan.planHash !== dto.expectedPlanHash)
          throw new ConflictException("The World migration preview changed; preview it again.");
        if (!plan.ready)
          throw new BadRequestException("Resolve every World migration conflict before applying it.");
        const mapping = new Map((dto.mappings ?? []).map((m) => [`${m.resourceType}\0${m.sourceId}`, m.targetId]));
        const records = readRecords(draft.snapshotRecords).map((record) => ({
          ...record,
          payload: rewriteModelConformance(
            rewriteWorldReferences(record.payload, mapping),
            modelMigration?.targetReleaseIds,
          ),
        }));
        const content = rewriteWorldReferences(draft.content, mapping);
        const migrated = { ...draft, content: jsonValue(content), snapshotRecords: jsonArray(records), capturedWorldSnapshot: target };
        const report = await this.validationReport(migrated, userId);
        if (!report.valid) throw new BadRequestException("The migrated Campaign Definition does not conform to the selected World revision.");
        const revision = await tx.campaignDefinitionRevision.create({
          data: {
            campaignDefinitionId: id, worldDefinitionId: draft.worldDefinitionId,
            capturedWorldSnapshotId: target.id,
            revisionNumber: (campaign.currentRevision?.revisionNumber ?? 0) + 1,
            predecessorRevisionId: draft.baseRevisionId, name: draft.revisionName,
            content: jsonValue(content), contentHash: canonicalJsonHash(content),
            createdByUserId: userId, sourceDraftRevision: draft.storageRevision,
          }, select: revisionWriteSelect,
        });
        const snapshot = await createSnapshot(tx, id, revision, target.id, content, records);
        const advanced = await tx.campaignDefinition.updateMany({
          where: { id, ownerUserId: userId, currentRevisionId: draft.baseRevisionId },
          data: { currentRevisionId: revision.id, updatedAt: new Date() },
        });
        if (advanced.count !== 1) throw staleBase();
        const nextStorageRevision = draft.storageRevision + 1;
        const draftAdvanced = await tx.campaignDefinitionDraft.updateMany({
          where: { id: draft.id, storageRevision: draft.storageRevision },
          data: {
            baseRevisionId: revision.id, baseSnapshotId: snapshot.id,
            capturedWorldSnapshotId: target.id, content: jsonValue(content),
            snapshotRecords: jsonArray(records), storageRevision: nextStorageRevision,
            validationStatus: "VALID", validatedStorageRevision: nextStorageRevision,
            validationReport: jsonObject(report), updatedByUserId: userId, updatedAt: new Date(),
          },
        });
        if (draftAdvanced.count !== 1) throw staleDraft();
        await tx.campaignDefinitionWorldMigrationAudit.create({
          data: {
            campaignDefinitionId: id, predecessorCampaignRevisionId: draft.baseRevisionId,
            sourceWorldSnapshotId: draft.capturedWorldSnapshotId,
            targetWorldSnapshotId: target.id, resultCampaignRevisionId: revision.id,
            sourceDraftRevision: draft.storageRevision, resolutionPlan: jsonObject(plan),
            planHash: plan.planHash, createdByUserId: userId,
          },
        });
        return publicationResponse(revision, snapshot, target);
      }, serializable);
    } catch (error) { this.rethrow(error); }
  }

  private async publishTransaction(id: string, expectedStorageRevision: number, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.campaignDefinitionRevision.findFirst({
          where: { campaignDefinitionId: id, sourceDraftRevision: expectedStorageRevision, campaignDefinition: { ownerUserId: userId } },
          select: { ...revisionWriteSelect, predecessorRevisionId: true, publishedAt: true, capturedWorldSnapshot: { select: worldSnapshotSelect }, snapshots: { select: { id: true, contentHash: true, capturedAt: true }, take: 1 } },
        });
        if (prior) return publicationResponse(prior, prior.snapshots[0], prior.capturedWorldSnapshot);
        const campaign = await tx.campaignDefinition.findUnique({
          where: { id, ownerUserId: userId },
          select: { status: true, currentRevisionId: true, currentRevision: { select: { revisionNumber: true } }, draft: { select: draftSelect } },
        });
        if (!campaign?.draft) throw notFound();
        if (campaign.status !== "ACTIVE") throw archivedConflict();
        const draft = campaign.draft;
        if (draft.storageRevision !== expectedStorageRevision) throw staleDraft();
        if ((draft.baseRevisionId ?? null) !== (campaign.currentRevisionId ?? null)) throw staleBase();
        if (draft.validationStatus !== "VALID" || draft.validatedStorageRevision !== draft.storageRevision)
          throw new BadRequestException("Validate this exact Campaign draft revision before publishing it.");
        const report = await this.validationReport(draft, userId);
        if (!report.valid) throw new BadRequestException("The Campaign draft must pass validation before publication.");
        const records = readRecords(draft.snapshotRecords);
        const revision = await tx.campaignDefinitionRevision.create({
          data: {
            campaignDefinitionId: id, worldDefinitionId: draft.worldDefinitionId,
            capturedWorldSnapshotId: draft.capturedWorldSnapshotId,
            revisionNumber: (campaign.currentRevision?.revisionNumber ?? 0) + 1,
            predecessorRevisionId: campaign.currentRevisionId,
            name: draft.revisionName, content: jsonValue(draft.content),
            contentHash: canonicalJsonHash(draft.content), createdByUserId: userId,
            sourceDraftRevision: draft.storageRevision,
          }, select: revisionWriteSelect,
        });
        const snapshot = await createSnapshot(tx, id, revision, draft.capturedWorldSnapshotId, draft.content, records);
        const head = await tx.campaignDefinition.updateMany({
          where: { id, ownerUserId: userId, status: "ACTIVE", currentRevisionId: campaign.currentRevisionId },
          data: { currentRevisionId: revision.id, updatedAt: new Date() },
        });
        if (head.count !== 1) throw staleBase();
        const next = draft.storageRevision + 1;
        const advanced = await tx.campaignDefinitionDraft.updateMany({
          where: { id: draft.id, storageRevision: draft.storageRevision },
          data: {
            baseRevisionId: revision.id, baseSnapshotId: snapshot.id,
            storageRevision: next, validationStatus: "VALID",
            validatedStorageRevision: next, validationReport: jsonObject(report),
            updatedByUserId: userId, updatedAt: new Date(),
          },
        });
        if (advanced.count !== 1) throw staleDraft();
        return publicationResponse(revision, snapshot, draft.capturedWorldSnapshot);
      }, serializable);
    } catch (error) { this.rethrow(error); }
  }

  private async validationReport(draft: DraftLike, userId: string) {
    const worldManifest = draft.capturedWorldSnapshot.manifest;
    if (!isCanonicalSnapshotManifest(worldManifest))
      return { valid: false, issues: [{ code: "captured-world-invalid", subject: "Captured World", detail: "The captured World snapshot failed its integrity check." }] };
    const report = validateCampaignDefinitionDraft(
      draft.campaignDefinitionId, draft.content, readRecords(draft.snapshotRecords), worldManifest,
    );
    const issues = [...report.issues];
    if (isObject(draft.content) && Array.isArray(draft.content.modelSchemaReleaseIds)) {
      const worldReleases = draft.capturedWorldSnapshot.worldDefinitionRevision.modelSchemaSelections.map((s) => s.modelSchemaReleaseId);
      const campaignReleases = draft.content.modelSchemaReleaseIds.filter((id): id is string => typeof id === "string");
      try {
        const releases = [...worldReleases, ...campaignReleases];
        const effectiveModel = await this.models.resolveEffectiveRootsForCampaign(
          releases,
          userId,
          draft.worldDefinitionId,
          draft.campaignDefinitionId,
        );
        assertGovernedRecordConformance(
          readRecords(draft.snapshotRecords),
          releases,
          effectiveModel.elements,
        );
        assertCampaignGovernedRecordConformance(
          readRecords(draft.snapshotRecords),
          releases,
          effectiveModel.elements,
        );
      } catch {
        issues.push({ code: "model-conformance-invalid", subject: "Campaign Definition", detail: "The exact Model Schema release selection is unavailable or incompatible." });
      }
    }
    issues.sort((a, b) => a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject));
    return { valid: issues.length === 0, issues };
  }

  private async assessModelMigration(
    draft: DraftLike,
    target: WorldSnapshotRow,
    userId: string,
  ): Promise<ModelMigrationAssessment | undefined> {
    const sourceWorldReleases = [...revisionModelReleaseIds(draft.capturedWorldSnapshot)];
    const targetWorldReleases = [...revisionModelReleaseIds(target)];
    if (canonicalJsonHash(sourceWorldReleases) === canonicalJsonHash(targetWorldReleases)) {
      return undefined;
    }
    const campaignReleases = isObject(draft.content) && Array.isArray(draft.content.modelSchemaReleaseIds)
      ? draft.content.modelSchemaReleaseIds.filter((id): id is string => typeof id === "string")
      : [];
    const targetReleaseIds = [...targetWorldReleases, ...campaignReleases];
    const records = readRecords(draft.snapshotRecords);
    try {
      const effective = await this.models.resolveEffectiveRootsForCampaign(
        targetReleaseIds, userId, draft.worldDefinitionId, draft.campaignDefinitionId,
      );
      const migrated = records.map((record) => ({
        ...record,
        payload: rewriteModelConformance(record.payload, targetReleaseIds),
      }));
      assertGovernedRecordConformance(migrated, targetReleaseIds, effective.elements);
      assertCampaignGovernedRecordConformance(migrated, targetReleaseIds, effective.elements);
      return {
        targetReleaseIds,
        compatible: true,
        candidates: modelConceptCandidates(effective.elements),
      };
    } catch {
      let candidates: ModelMigrationAssessment["candidates"] = [];
      try {
        const effective = await this.models.resolveEffectiveRootsForCampaign(
          targetReleaseIds, userId, draft.worldDefinitionId, draft.campaignDefinitionId,
        );
        candidates = modelConceptCandidates(effective.elements);
      } catch {
        // The bounded conflict below is authoritative and does not expose registry details.
      }
      return { targetReleaseIds, compatible: false, candidates };
    }
  }

  private async ownedDraft(id: string, userId: string) {
    try {
      const row = await this.prisma.campaignDefinition.findUnique({
        where: { id, ownerUserId: userId }, select: { status: true, metadataRevision: true, draft: { select: draftSelect } },
      });
      if (!row?.draft) throw notFound();
      return { ...row, draft: row.draft };
    } catch (error) { this.rethrow(error); }
  }

  private async assertNoUnpublishedEdits(draft: DraftLike, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (!draft.baseSnapshotId || !draft.baseRevisionId)
      throw new ConflictException("Publish the initial Campaign Definition before migrating its World.");
    const base = await client.campaignDefinitionSnapshot.findUnique({
      where: { id: draft.baseSnapshotId }, select: { manifest: true, campaignDefinitionRevision: { select: { content: true } } },
    });
    if (!base || !isCanonicalSnapshotManifest(base.manifest)) throw staleBase();
    const baseRecords = base.manifest.records.filter((r) => r.resourceType !== RESERVED_RECORD).map(({ resourceType, sourceId, sourceRevision, payload }) => ({ resourceType, sourceId, ...(sourceRevision ? { sourceRevision } : {}), payload }));
    if (canonicalJsonHash(base.campaignDefinitionRevision.content) !== canonicalJsonHash(draft.content) ||
        canonicalJsonHash(normalizeRecords(baseRecords)) !== canonicalJsonHash(normalizeRecords(readRecords(draft.snapshotRecords))))
      throw new ConflictException("Publish or discard Campaign authoring changes before migrating its World.");
  }

  private async setArchived(id: string, expected: number, userId: string, archived: boolean) {
    const changed = await this.prisma.campaignDefinition.updateMany({
      where: { id, ownerUserId: userId, metadataRevision: expected, status: archived ? "ACTIVE" : "ARCHIVED" },
      data: { status: archived ? "ARCHIVED" : "ACTIVE", archivedAt: archived ? new Date() : null, metadataRevision: { increment: 1 }, updatedAt: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException("The Campaign Definition lifecycle changed; refresh before trying again.");
    const row = await this.prisma.campaignDefinition.findUnique({ where: { id, ownerUserId: userId }, select: { name: true, status: true, archivedAt: true, metadataRevision: true } });
    if (!row) throw notFound();
    return { name: row.name, status: row.status.toLowerCase(), archivedAt: row.archivedAt?.toISOString(), metadataRevision: row.metadataRevision };
  }

  private rethrow(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    if (isPrismaConflict(error)) throw staleDraft();
    throw unavailable();
  }
}

type WorldSnapshotRow = Prisma.WorldDefinitionSnapshotGetPayload<{ select: typeof worldSnapshotSelect }>;
type DraftRow = Prisma.CampaignDefinitionDraftGetPayload<{ select: typeof draftSelect }>;
type DraftLike = Omit<DraftRow, "content" | "snapshotRecords"> & { content: unknown; snapshotRecords: unknown };

const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
const revisionWriteSelect = {
  id: true, revisionNumber: true, predecessorRevisionId: true,
  name: true, contentHash: true, publishedAt: true,
} as const;

async function ownedWorldSnapshot(
  client: Prisma.TransactionClient | PrismaService,
  id: string,
  userId: string,
): Promise<WorldSnapshotRow> {
  const row = await client.worldDefinitionSnapshot.findFirst({
    where: {
      id,
      worldDefinitionRevision: { worldDefinition: { ownerUserId: userId } },
    },
    select: worldSnapshotSelect,
  });
  if (!row || !isCanonicalSnapshotManifest(row.manifest))
    throw new NotFoundException("The selected World revision was not found.");
  return row;
}

async function createSnapshot(
  tx: Prisma.TransactionClient,
  campaignDefinitionId: string,
  revision: { id: string; revisionNumber: number },
  capturedWorldSnapshotId: string,
  content: unknown,
  records: readonly CampaignDraftRecord[],
) {
  const manifest = buildSnapshotManifest(1, [
    { resourceType: RESERVED_RECORD, sourceId: revision.id, sourceRevision: revision.revisionNumber, payload: content },
    ...records,
  ]);
  return tx.campaignDefinitionSnapshot.create({
    data: {
      campaignDefinitionId, campaignDefinitionRevisionId: revision.id,
      capturedWorldSnapshotId, manifest: jsonObject(manifest), contentHash: manifest.contentHash,
    }, select: { id: true, contentHash: true, capturedAt: true },
  });
}

function newCampaignContent() {
  return {
    formatVersion: 1, gmPremise: "", playerIntroduction: "",
    plotDefinitionIds: [], placementDefinitionIds: [], modelSchemaReleaseIds: [],
  };
}

function normalizeRecords(records: readonly CampaignDraftRecord[]): CampaignDraftRecord[] {
  return records.map((record) => ({
    resourceType: record.resourceType.trim(), sourceId: record.sourceId.trim(),
    ...(record.sourceRevision === undefined ? {} : { sourceRevision: record.sourceRevision }),
    payload: record.payload,
  })).sort((a, b) => `${a.resourceType}\0${a.sourceId}`.localeCompare(`${b.resourceType}\0${b.sourceId}`, "en"));
}

function readRecords(value: unknown): CampaignDraftRecord[] {
  if (!Array.isArray(value)) throw new BadRequestException("Campaign draft records are malformed.");
  const records: CampaignDraftRecord[] = value.map((record) => {
    if (!isObject(record) || typeof record.resourceType !== "string" || typeof record.sourceId !== "string" || !("payload" in record))
      throw new BadRequestException("Campaign draft records are malformed.");
    if (record.sourceRevision !== undefined && (!Number.isInteger(record.sourceRevision) || Number(record.sourceRevision) < 1))
      throw new BadRequestException("Campaign draft records are malformed.");
    return {
      resourceType: record.resourceType, sourceId: record.sourceId,
      ...(typeof record.sourceRevision === "number" ? { sourceRevision: record.sourceRevision } : {}),
      payload: record.payload,
    };
  });
  return normalizeRecords(records);
}

function assertBounded(content: unknown, records: readonly CampaignDraftRecord[]) {
  if (!isObject(content) || !isPublicationJson(content) || !isPublicationJson(records) || Buffer.byteLength(JSON.stringify({ content, records }), "utf8") > MAX_DRAFT_BYTES)
    throw new BadRequestException("Campaign draft content must be a bounded JSON document.");
}

function safeRichTextFields(content: Record<string, unknown>): boolean {
  return typeof content.gmPremise === "string" &&
    isSafeCampaignRichText(content.gmPremise) &&
    typeof content.playerIntroduction === "string" &&
    isSafeCampaignRichText(content.playerIntroduction);
}

function draftResponse(row: DraftRow) {
  return {
    id: row.id, campaignDefinitionId: row.campaignDefinitionId,
    baseRevisionId: row.baseRevisionId ?? undefined, baseSnapshotId: row.baseSnapshotId ?? undefined,
    capturedWorldSnapshotId: row.capturedWorldSnapshotId,
    capturedWorld: worldSummary(row.capturedWorldSnapshot, true),
    capturedWorldContent: projectWorld(row.capturedWorldSnapshot),
    revisionName: row.revisionName, content: row.content, records: row.snapshotRecords,
    storageRevision: row.storageRevision,
    validationStatus: row.validationStatus.toLowerCase().replaceAll("_", "-"),
    validatedStorageRevision: row.validatedStorageRevision ?? undefined,
    validationReport: row.validationReport ?? undefined,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function listResponse(row: Prisma.CampaignDefinitionGetPayload<{ select: typeof listSelect }>) {
  const current = row.currentRevision;
  const directSuccessor = current?.capturedWorldSnapshot
    .worldDefinitionRevision.successorRevisions.find(
      (revision) => revision.snapshots.length > 0,
    );
  return {
    id: row.id, name: row.name, description: row.description ?? undefined,
    status: row.status.toLowerCase(), archivedAt: row.archivedAt?.toISOString(),
    metadataRevision: row.metadataRevision, updatedAt: row.updatedAt.toISOString(),
    draft: row.draft ? {
      storageRevision: row.draft.storageRevision,
      revisionName: row.draft.revisionName,
      validationStatus: row.draft.validationStatus.toLowerCase().replaceAll("_", "-"),
      validatedStorageRevision: row.draft.validatedStorageRevision ?? undefined,
      hasUnpublishedChanges:
        !current ||
        row.draft.storageRevision !== (current.sourceDraftRevision ?? 0) + 1,
    } : undefined,
    currentRevision: current ? { id: current.id, revisionNumber: current.revisionNumber, name: current.name, contentHash: current.contentHash, publishedAt: current.publishedAt.toISOString(), capturedWorld: worldSummary(current.capturedWorldSnapshot) } : undefined,
    availableWorldMigration: directSuccessor
      ? {
          worldName:
            current?.capturedWorldSnapshot.worldDefinitionRevision
              .worldDefinition.name ?? "World",
          revisionNumber: directSuccessor.revisionNumber,
        }
      : undefined,
  };
}

function detailResponse(row: Prisma.CampaignDefinitionGetPayload<{ select: typeof detailSelect }>) {
  return {
    id: row.id, name: row.name, description: row.description ?? undefined,
    status: row.status.toLowerCase(), archivedAt: row.archivedAt?.toISOString(),
    metadataRevision: row.metadataRevision, currentRevisionId: row.currentRevisionId ?? undefined,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    draft: row.draft ? draftResponse(row.draft) : undefined,
    revisions: row.revisions.map((revision) => ({
      id: revision.id, revisionNumber: revision.revisionNumber,
      predecessorRevisionId: revision.predecessorRevisionId ?? undefined,
      name: revision.name, contentHash: revision.contentHash,
      publishedAt: revision.publishedAt.toISOString(),
      capturedWorld: worldSummary(revision.capturedWorldSnapshot),
      snapshot: revision.snapshots[0] ? { id: revision.snapshots[0].id, contentHash: revision.snapshots[0].contentHash, capturedAt: revision.snapshots[0].capturedAt.toISOString() } : undefined,
    })),
  };
}

function publicationResponse(
  revision: { id: string; revisionNumber: number; predecessorRevisionId: string | null; name: string; contentHash: string; publishedAt: Date },
  snapshot: { id: string; contentHash: string; capturedAt: Date }, world: WorldSnapshotRow,
) {
  return {
    id: revision.id, revisionNumber: revision.revisionNumber,
    predecessorRevisionId: revision.predecessorRevisionId ?? undefined,
    name: revision.name, contentHash: revision.contentHash,
    publishedAt: revision.publishedAt.toISOString(),
    snapshot: { id: snapshot.id, contentHash: snapshot.contentHash, capturedAt: snapshot.capturedAt.toISOString() },
    capturedWorld: worldSummary(world),
  };
}

function worldSummary(row: WorldSnapshotRow, includeContentHash = false) {
  return {
    snapshotId: row.id, worldDefinitionId: row.worldDefinitionId,
    worldDefinitionRevisionId: row.worldDefinitionRevisionId,
    worldName: row.worldDefinitionRevision.worldDefinition.name,
    revisionName: row.worldDefinitionRevision.name,
    revisionNumber: row.worldDefinitionRevision.revisionNumber,
    publishedAt: row.worldDefinitionRevision.publishedAt.toISOString(),
    ...(includeContentHash ? { snapshotContentHash: row.contentHash } : {}),
  };
}

function projectWorld(row: WorldSnapshotRow) {
  if (!isCanonicalSnapshotManifest(row.manifest)) return { locations: [], creatures: [], items: [], placements: [] };
  const locations = row.manifest.records.filter((r) => r.resourceType === "locations").map((r) => humanWorldRecord(r, "Location"));
  const definitions = row.manifest.records.filter((r) => r.resourceType === "definitions");
  const creatures = [...row.manifest.records.filter((r) => r.resourceType === "creatures"), ...definitions.filter((r) => isObject(r.payload) && r.payload.kind === "creature")].map((r) => humanWorldRecord(r, "Creature"));
  const items = definitions.filter((r) => isObject(r.payload) && r.payload.kind === "item").map((r) => humanWorldRecord(r, "Item"));
  const placements = row.manifest.records.filter((r) => r.resourceType === "world-placements").map((r) => humanWorldRecord(r, "World placement"));
  return { locations, creatures, items, placements };
}

function humanWorldRecord(record: { sourceId: string; payload: unknown }, fallback: string) {
  const payload = isObject(record.payload) ? record.payload : {};
  const identity = isObject(payload.identity) ? payload.identity : {};
  const placement = isObject(payload.placement) ? payload.placement : {};
  return { id: record.sourceId, name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : typeof identity.name === "string" && identity.name.trim() ? identity.name.trim() : fallback, kind: typeof payload.kind === "string" ? payload.kind : undefined, parentLocationId: typeof placement.parentLocationId === "string" ? placement.parentLocationId : typeof payload.parentLocationId === "string" ? payload.parentLocationId : undefined, locationId: typeof payload.locationId === "string" ? payload.locationId : undefined };
}

export function buildCampaignWorldMigrationPlan(
  draft: DraftLike,
  target: WorldSnapshotRow,
  suppliedMappings: readonly { resourceType: string; sourceId: string; targetId: string }[],
  projection: {
    readonly conflictOffset?: number;
    readonly candidateOffset?: number;
    readonly impactOffset?: number;
    readonly changeOffset?: number;
    readonly modelMigration?: ModelMigrationAssessment;
    readonly presentationPageSize?: number;
    readonly internal?: boolean;
  } = {},
) {
  const source = draft.capturedWorldSnapshot;
  const presentationPageSize = Math.max(
    1,
    Math.min(
      MAX_MIGRATION_CHANGES_PER_KIND,
      projection.presentationPageSize ?? MAX_MIGRATION_CHANGES_PER_KIND,
    ),
  );
  if (target.worldDefinitionId !== source.worldDefinitionId)
    throw new BadRequestException("The selected World revision belongs to a different World.");
  if (target.worldDefinitionRevision.predecessorRevisionId !== source.worldDefinitionRevisionId)
    throw new BadRequestException("World migration must adopt the direct successor revision.");
  if (!isCanonicalSnapshotManifest(source.manifest) || !isCanonicalSnapshotManifest(target.manifest))
    throw new BadRequestException("A selected World snapshot failed its integrity check.");

  const sourceRecords = keyed(source.manifest.records.filter((r) => r.resourceType !== "world-definition-revision"));
  const targetRecords = keyed(target.manifest.records.filter((r) => r.resourceType !== "world-definition-revision"));
  const normalizedMappings = [...suppliedMappings].map((item) => ({
    resourceType: item.resourceType.trim(),
    sourceId: item.sourceId.trim(),
    targetId: item.targetId.trim(),
  })).sort((left, right) =>
    `${left.resourceType}\0${left.sourceId}`.localeCompare(
      `${right.resourceType}\0${right.sourceId}`,
      "en",
    ),
  );
  const targetCandidates = indexCandidates(targetRecords);
  const mapping = new Map<string, string>();
  const conflictSeeds: MigrationConflictSeed[] = [];
  let conflictCount = 0;
  const addConflict = (conflict: MigrationConflictSeed) => {
    conflictCount += 1;
    conflictSeeds.push(conflict);
  };
  if (projection.modelMigration && !projection.modelMigration.compatible) {
    addConflict({
      code: "model-schema-incompatible",
      subject: "Campaign Model conformance",
      detail: "The successor World changes a governed concept or field required by this Campaign. Publish a direct World successor that retains compatible concepts and fields, then preview migration again.",
      sourceLabel: "Campaign Model conformance",
      candidates: projection.modelMigration.candidates.slice(
        0,
        MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
      ),
      candidateSummary: {
        total: projection.modelMigration.candidates.length,
        returned: Math.min(
          projection.modelMigration.candidates.length,
          MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
        ),
        offset: 0,
        truncated:
          projection.modelMigration.candidates.length >
          MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
      },
    });
  }
  for (const supplied of normalizedMappings) {
    const key = `${supplied.resourceType.trim()}\0${supplied.sourceId.trim()}`;
    const targetKey = `${supplied.resourceType.trim()}\0${supplied.targetId.trim()}`;
    const sourceRecord = sourceRecords.get(key);
    const targetRecord = targetRecords.get(targetKey);
    if (mapping.has(key) || !sourceRecord || !targetRecord ||
        semanticRecordKind(sourceRecord) !== semanticRecordKind(targetRecord)) {
      addConflict({ code: "mapping-invalid", subject: label(sourceRecords.get(key), "World content"), detail: "A migration mapping is duplicated or does not resolve to compatible target content." });
    } else mapping.set(key, supplied.targetId.trim());
  }
  const added: ReturnType<typeof changeItem>[] = [];
  const removed: ReturnType<typeof changeItem>[] = [];
  const changed: ReturnType<typeof changeItem>[] = [];
  for (const [key, record] of targetRecords) {
    const before = sourceRecords.get(key);
    if (!before) added.push(changeItem(record));
    else if (before.contentHash !== record.contentHash) changed.push(changeItem(record));
  }
  for (const [key, record] of sourceRecords) if (!targetRecords.has(key)) removed.push(changeItem(record));

  const authoredReferences = collectStrings({
    content: draft.content,
    records: draft.snapshotRecords,
  });
  const impact = buildMigrationImpact(
    draft,
    source,
    target,
    sourceRecords,
    targetRecords,
    changed,
    removed,
    authoredReferences,
    projection.impactOffset ?? 0,
    presentationPageSize,
  );
  for (const item of removed) {
    if (authoredReferences.has(item.id) && !mapping.has(`${item.resourceType}\0${item.id}`))
      addConflict({
        code: "referenced-content-removed", subject: item.name,
        detail: `${item.typeLabel} is referenced by Campaign content but is absent from the target World revision.`,
        source: { resourceType: item.resourceType, id: item.id },
        sourceLabel: item.name,
        candidateResourceType: candidateIndexKey(
          sourceRecords.get(`${item.resourceType}\0${item.id}`),
        ),
      });
  }
  const decorations = readRecords(draft.snapshotRecords).filter((r) => r.resourceType === "campaign-placements" && isObject(r.payload) && r.payload.kind === "world-decoration" && typeof r.payload.capturedWorldPlacementId === "string");
  for (const decoration of decorations) {
    const placementId = (decoration.payload as Record<string, unknown>).capturedWorldPlacementId as string;
    const key = `world-placements\0${placementId}`;
    const before = sourceRecords.get(key), after = targetRecords.get(key);
    if ((!after || before?.contentHash !== after.contentHash) && !mapping.has(key))
      addConflict({
        code: after ? "decorated-placement-changed" : "decorated-placement-removed",
        subject: label(before, "World placement"),
        detail: "A decorated World placement changed and requires an explicit mapping acknowledgement.",
        source: { resourceType: "world-placements", id: placementId },
        sourceLabel: label(before, "World placement"),
        candidateResourceType: candidateIndexKey(before),
      });
  }
  conflictSeeds.sort((a, b) => a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject));
  const conflictOffset = Math.max(0, projection.conflictOffset ?? 0);
  const candidateOffset = Math.max(0, projection.candidateOffset ?? 0);
  const conflicts: MigrationConflict[] = conflictSeeds
    .slice(conflictOffset, conflictOffset + MAX_MIGRATION_CONFLICTS)
    .map(({ candidateResourceType, ...conflict }) => {
      if (!candidateResourceType) return conflict;
      const allCandidates = targetCandidates.get(candidateResourceType) ?? [];
      const candidates = allCandidates.slice(
        candidateOffset,
        candidateOffset + MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
      );
      return {
        ...conflict,
        candidates,
        candidateSummary: {
          total: allCandidates.length,
          returned: candidates.length,
          offset: candidateOffset,
          truncated:
            candidateOffset > 0 ||
            candidateOffset + candidates.length < allCandidates.length,
        },
      };
    });
  const changeOffset = Math.max(0, projection.changeOffset ?? 0);
  const changePage = <T>(items: readonly T[]) => projection.internal
    ? items
    : items.slice(changeOffset, changeOffset + presentationPageSize);
  const changeSummary = {
    added: added.length,
    changed: changed.length,
    removed: removed.length,
    returned: {
      added: changePage(added).length,
      changed: changePage(changed).length,
      removed: changePage(removed).length,
    },
    offset: changeOffset,
    nextOffset: Math.max(added.length, changed.length, removed.length) >
      changeOffset + presentationPageSize
      ? changeOffset + presentationPageSize
      : undefined,
    truncated:
      changeOffset > 0 ||
      Math.max(added.length, changed.length, removed.length) >
        changeOffset + presentationPageSize,
  };
  const conflictSummary = {
    total: conflictCount,
    returned: conflicts.length,
    offset: conflictOffset,
    nextOffset:
      conflictOffset + conflicts.length < conflictCount
        ? conflictOffset + conflicts.length
        : undefined,
    truncated:
      conflictOffset > 0 || conflictOffset + conflicts.length < conflictCount,
  };
  const changes = {
    added: changePage(added),
    changed: changePage(changed),
    removed: changePage(removed),
  };
  const semanticBasis = {
    formatVersion: 1, campaignDefinitionId: draft.campaignDefinitionId,
    expectedStorageRevision: draft.storageRevision,
    sourceWorldSnapshotId: source.id, targetWorldSnapshotId: target.id,
    sourceWorldContentHash: source.contentHash, targetWorldContentHash: target.contentHash,
    mappings: normalizedMappings,
    targetModelReleaseIds: projection.modelMigration?.targetReleaseIds ?? [],
    changeHash: canonicalJsonHash({ added, changed, removed }),
    conflictCount,
  };
  const planHash = canonicalJsonHash(semanticBasis);
  const result = {
    formatVersion: 1,
    campaignDefinitionId: draft.campaignDefinitionId,
    expectedStorageRevision: draft.storageRevision,
    sourceWorldSnapshotId: source.id,
    targetWorldSnapshotId: target.id,
    sourceWorldContentHash: source.contentHash,
    targetWorldContentHash: target.contentHash,
    mappings: projection.internal ? normalizedMappings : [],
    changes,
    changeSummary,
    conflicts,
    conflictSummary,
    impact,
    planHash,
    presentationTruncated: changeSummary.truncated || impact.presentationTruncated || conflictSummary.truncated,
    ready: conflictCount === 0,
    sourceWorld: worldSummary(source), targetWorld: worldSummary(target),
  };
  if (projection.internal) return result;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_MIGRATION_PREVIEW_BYTES) {
    return result;
  }
  if (presentationPageSize > 1) {
    return buildCampaignWorldMigrationPlan(draft, target, suppliedMappings, {
      ...projection,
      presentationPageSize: Math.max(1, Math.floor(presentationPageSize / 2)),
    });
  }
  const semanticallyReady = conflictCount === 0;
  const compactBase = {
    ...result,
    mappings: [],
    impact: { ...result.impact, presentationTruncated: true },
    conflicts: semanticallyReady ? [] : [{
        code: "migration-preview-size-limit",
        subject: "Migration review",
        detail: "The migration has more detail than can be reviewed safely in one response.",
      }] as MigrationConflict[],
    conflictSummary: {
      total: conflictCount,
      returned: semanticallyReady ? 0 : 1,
      offset: conflictOffset,
      nextOffset: undefined,
      truncated: conflictCount > 0,
    },
    presentationTruncated: true,
    ready: semanticallyReady,
  };
  return compactBase;
}

type ManifestRecord = CanonicalSnapshotManifest["records"][number];
export interface MigrationConflict {
  code: string;
  subject: string;
  detail: string;
  source?: { resourceType: string; id: string };
  sourceLabel?: string;
  candidates?: { id: string; label: string; typeLabel: string }[];
  candidateSummary?: {
    total: number;
    returned: number;
    offset: number;
    truncated: boolean;
  };
}

interface ModelMigrationAssessment {
  readonly targetReleaseIds: readonly string[];
  readonly compatible: boolean;
  readonly candidates: readonly { id: string; label: string; typeLabel: string }[];
}

function rewriteModelConformance(
  value: unknown,
  targetReleaseIds: readonly string[] | undefined,
): unknown {
  if (!targetReleaseIds || !isObject(value) || !isObject(value.conformance)) return value;
  return {
    ...value,
    conformance: {
      ...value.conformance,
      modelSchemaReleaseIds: [...targetReleaseIds],
    },
  };
}

function modelConceptCandidates(
  elements: readonly CompiledModelElement[],
): { id: string; label: string; typeLabel: string }[] {
  return elements
    .filter((element) => element.lineage.kind === "concept" &&
      (element.lineage.semanticRole === "aow:plot" ||
        element.lineage.semanticRole === "aow:campaign-placement"))
    .map((element) => ({
      id: element.lineage.id,
      label: element.revision.presentation.label.slice(0, 160),
      typeLabel: element.lineage.semanticRole === "aow:plot"
        ? "Plot concept"
        : "Campaign placement concept",
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "en"));
}

function buildMigrationImpact(
  draft: DraftLike,
  source: WorldSnapshotRow,
  target: WorldSnapshotRow,
  sourceRecords: ReadonlyMap<string, ManifestRecord>,
  targetRecords: ReadonlyMap<string, ManifestRecord>,
  changed: readonly ReturnType<typeof changeItem>[],
  removed: readonly ReturnType<typeof changeItem>[],
  authoredReferences: ReadonlySet<string>,
  requestedOffset: number,
  pageSize: number,
) {
  const offset = Math.max(0, requestedOffset);
  const locationMoves = changed.flatMap((item) => {
    if (item.resourceType !== "locations") return [];
    const before = sourceRecords.get(`locations\0${item.id}`);
    const after = targetRecords.get(`locations\0${item.id}`);
    const fromParentId = placementParent(before);
    const toParentId = placementParent(after);
    if (fromParentId === toParentId) return [];
    return [{
      locationName: item.name,
      fromParentName: fromParentId
        ? label(sourceRecords.get(`locations\0${fromParentId}`), "Former parent Location")
        : "World root",
      toParentName: toParentId
        ? label(targetRecords.get(`locations\0${toParentId}`), "New parent Location")
        : "World root",
    }];
  });
  const affectedItems = [...changed, ...removed].filter((item) =>
    authoredReferences.has(item.id),
  );
  const affectedReferences = affectedItems.map((item) => ({
    name: item.name,
    typeLabel: item.typeLabel,
    change: removed.includes(item) ? "removed" as const : "changed" as const,
  }));
  const affectedIds = new Set(affectedItems.map(({ id }) => id));
  const affectedPlots = readRecords(draft.snapshotRecords).flatMap((record) => {
    if (record.resourceType !== "plots" || !isObject(record.payload)) return [];
    const references = collectStrings(record.payload);
    const reasons = affectedItems
      .filter(({ id }) => references.has(id))
      .slice(0, 5)
      .map(({ name, typeLabel }) => `${typeLabel}: ${name}`);
    if (![...references].some((id) => affectedIds.has(id))) return [];
    return [{ plotName: label(record as ManifestRecord, "Plot"), reasons }];
  });
  const sourceReleaseIds = revisionModelReleaseIds(source);
  const targetReleaseIds = revisionModelReleaseIds(target);
  const modelAdded = [...targetReleaseIds].filter((id) => !sourceReleaseIds.has(id));
  const modelRemoved = [...sourceReleaseIds].filter((id) => !targetReleaseIds.has(id));
  const releaseLabel = (id: string, row: WorldSnapshotRow) => {
    const release = row.worldDefinitionRevision.modelSchemaSelections.find(
      (selection) => selection.modelSchemaReleaseId === id,
    )?.modelSchemaRelease;
    return release
      ? `${release.registry.name}: ${release.name} (revision ${release.revisionNumber})`
      : "Selected Model release";
  };
  const page = <T>(items: readonly T[]) =>
    items.slice(offset, offset + pageSize);
  return {
    offset,
    nextOffset: Math.max(locationMoves.length, affectedPlots.length, affectedReferences.length, modelAdded.length, modelRemoved.length) > offset + pageSize
      ? offset + pageSize
      : undefined,
    presentationTruncated: false,
    summary: {
      locationMoves: locationMoves.length,
      affectedPlots: affectedPlots.length,
      affectedReferences: affectedReferences.length,
      modelReleasesAdded: modelAdded.length,
      modelReleasesRemoved: modelRemoved.length,
    },
    locationMoves: page(locationMoves),
    affectedPlots: page(affectedPlots),
    affectedReferences: page(affectedReferences),
    modelReleases: {
      added: page(modelAdded).map((id) => ({ name: releaseLabel(id, target) })),
      removed: page(modelRemoved).map((id) => ({ name: releaseLabel(id, source) })),
    },
  };
}

function placementParent(record: ManifestRecord | undefined): string | undefined {
  if (!record || !isObject(record.payload) || !isObject(record.payload.placement)) return undefined;
  return typeof record.payload.placement.parentLocationId === "string"
    ? record.payload.placement.parentLocationId
    : undefined;
}

function assertCampaignGovernedRecordConformance(
  records: readonly CampaignDraftRecord[],
  releaseIds: readonly string[],
  elements: readonly CompiledModelElement[],
): void {
  const concepts = new Map(
    elements
      .filter((element) => element.lineage.kind === "concept")
      .map((element) => [element.lineage.id as string, element]),
  );
  const fields = elements.filter(
    (element) => element.lineage.kind === "field" &&
      isObject(element.revision.payload) &&
      element.revision.payload.kind === "field",
  );
  for (const record of records) {
    const semanticRole = record.resourceType === "plots"
      ? "aow:plot"
      : record.resourceType === "campaign-placements"
        ? "aow:campaign-placement"
        : undefined;
    if (!semanticRole || !isObject(record.payload)) continue;
    const matchingConcepts = [...concepts.values()].filter(
      (element) => element.lineage.semanticRole === semanticRole,
    );
    const conformance = record.payload.conformance;
    if (matchingConcepts.length === 0) {
      if (conformance !== undefined || record.payload.modelValues !== undefined) {
        throw new BadRequestException(
          "Campaign content declares Model values without an applicable Campaign concept.",
        );
      }
      continue;
    }
    if (!isObject(conformance) ||
        !Array.isArray(conformance.modelSchemaReleaseIds) ||
        conformance.modelSchemaReleaseIds.length !== releaseIds.length ||
        conformance.modelSchemaReleaseIds.some((id, index) => id !== releaseIds[index]) ||
        typeof conformance.conceptId !== "string" ||
        !matchingConcepts.some(({ lineage }) => lineage.id === conformance.conceptId)) {
      throw new BadRequestException(
        "Campaign content must declare exact conformance to an applicable Campaign concept.",
      );
    }
    const values = record.payload.modelValues;
    if (!isObject(values)) {
      throw new BadRequestException(
        "Campaign content governed by a Model concept must declare Model field values.",
      );
    }
    const ownedConceptIds = conceptAncestry(conformance.conceptId, concepts);
    const byStorageKey = new Map(fields.flatMap((element) => {
      const payload = element.revision.payload;
      return isObject(payload) && typeof payload.ownerConceptId === "string" &&
        ownedConceptIds.has(payload.ownerConceptId) && typeof payload.storageKey === "string"
        ? [[payload.storageKey, element] as const]
        : [];
    }));
    if (Object.keys(values).some((key) => !byStorageKey.has(key))) {
      throw new BadRequestException(
        "Campaign content includes a Model field that is not declared by its concept.",
      );
    }
    for (const [storageKey, element] of byStorageKey) {
      const field = element.revision.payload;
      if (!isObject(field) || !isObject(field.cardinality) || !isObject(field.valueType)) {
        throw new BadRequestException("A selected Campaign Model field is malformed.");
      }
      const value = values[storageKey];
      const minimum = typeof field.cardinality.minimum === "number"
        ? field.cardinality.minimum
        : 0;
      if (value === undefined) {
        if (minimum > 0 && field.defaultValue === undefined && field.computedValue === undefined) {
          throw new BadRequestException("Campaign content is missing a required Model field.");
        }
        continue;
      }
      assertCampaignModelValue(value, field);
    }
  }
}

function conceptAncestry(
  conceptId: string,
  concepts: ReadonlyMap<string, CompiledModelElement>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  let current: string | undefined = conceptId;
  while (current && !ids.has(current)) {
    ids.add(current);
    const payload: unknown = concepts.get(current)?.revision.payload;
    current = isObject(payload) && typeof payload.parentConceptId === "string"
      ? payload.parentConceptId
      : undefined;
  }
  return ids;
}

function assertCampaignModelValue(value: unknown, field: Record<string, unknown>): void {
  const valueType = field.valueType;
  const cardinality = field.cardinality;
  if (!isObject(valueType) || !isObject(cardinality) || !matchesModelValueType(value, valueType)) {
    throw new BadRequestException("A Campaign Model field value has the wrong type.");
  }
  const count = Array.isArray(value) ? value.length : 1;
  const minimum = typeof cardinality.minimum === "number" ? cardinality.minimum : 0;
  const maximum = typeof cardinality.maximum === "number" ? cardinality.maximum : undefined;
  if (count < minimum || (maximum !== undefined && count > maximum)) {
    throw new BadRequestException("A Campaign Model field value violates its cardinality.");
  }
  if (cardinality.unique === true && Array.isArray(value) &&
      new Set(value.map((entry) => canonicalJsonHash(entry))).size !== value.length) {
    throw new BadRequestException("A Campaign Model field requires unique values.");
  }
  const constraints = field.constraints;
  if (isObject(constraints)) {
    if (Array.isArray(constraints.allowedValues)) {
      const allowed = new Set(constraints.allowedValues.map((entry) => canonicalJsonHash(entry)));
      const entries = Array.isArray(value) ? value : [value];
      if (entries.some((entry) => !allowed.has(canonicalJsonHash(entry)))) {
        throw new BadRequestException("A Campaign Model field value is outside its allowed values.");
      }
    }
    if (Array.isArray(constraints.validationExpressions) && constraints.validationExpressions.length > 0) {
      throw new BadRequestException("Campaign Model validation expressions cannot yet be evaluated safely.");
    }
  }
  assertAtomicModelBounds(value, valueType);
}

function matchesModelValueType(value: unknown, valueType: Record<string, unknown>): boolean {
  if (valueType.kind === "list") {
    return Array.isArray(value) && isObject(valueType.item) &&
      value.every((entry) => matchesAtomicModelValue(entry, valueType.item as Record<string, unknown>));
  }
  return matchesAtomicModelValue(value, valueType);
}

function matchesAtomicModelValue(value: unknown, valueType: Record<string, unknown>): boolean {
  if (valueType.kind === "json") return isPublicationJson(value);
  if (valueType.kind === "string") return typeof value === "string";
  if (valueType.kind === "boolean") return typeof value === "boolean";
  if (valueType.kind === "integer") return typeof value === "number" && Number.isInteger(value);
  if (valueType.kind === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string";
}

function assertAtomicModelBounds(value: unknown, valueType: Record<string, unknown>): void {
  if (valueType.kind === "list" && Array.isArray(value) && isObject(valueType.item)) {
    for (const entry of value) assertAtomicModelBounds(entry, valueType.item);
    return;
  }
  if (typeof value === "string") {
    const minimum = typeof valueType.minimumLength === "number" ? valueType.minimumLength : 0;
    const maximum = typeof valueType.maximumLength === "number" ? valueType.maximumLength : undefined;
    if (typeof valueType.pattern === "string") {
      throw new BadRequestException(
        "Campaign Model pattern constraints cannot yet be evaluated safely.",
      );
    }
    if (value.length < minimum || (maximum !== undefined && value.length > maximum)) {
      throw new BadRequestException("A Campaign Model text field violates its constraints.");
    }
  }
  if (typeof value === "number") {
    const minimum = typeof valueType.minimum === "number" ? valueType.minimum : undefined;
    const maximum = typeof valueType.maximum === "number" ? valueType.maximum : undefined;
    if ((minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) {
      throw new BadRequestException("A Campaign Model numeric field violates its constraints.");
    }
  }
}

function revisionModelReleaseIds(row: WorldSnapshotRow): ReadonlySet<string> {
  if (row.worldDefinitionRevision.modelSchemaSelections.length > 0) {
    return new Set(
      row.worldDefinitionRevision.modelSchemaSelections.map(
        ({ modelSchemaReleaseId }) => modelSchemaReleaseId,
      ),
    );
  }
  const revision = isCanonicalSnapshotManifest(row.manifest)
    ? row.manifest.records.find((record) => record.resourceType === "world-definition-revision")
    : undefined;
  if (!revision || !isObject(revision.payload) || !Array.isArray(revision.payload.modelSchemaReleaseIds)) {
    return new Set();
  }
  return new Set(revision.payload.modelSchemaReleaseIds.filter((id): id is string => typeof id === "string"));
}
type MigrationConflictSeed = MigrationConflict & {
  candidateResourceType?: string;
};
function keyed(records: readonly ManifestRecord[]) {
  return new Map(records.map((r) => [`${r.resourceType}\0${r.sourceId}`, r]));
}
function label(record: ManifestRecord | undefined, fallback: string) {
  if (!record || !isObject(record.payload)) return fallback;
  const identity = isObject(record.payload.identity) ? record.payload.identity : {};
  const name = typeof record.payload.name === "string" ? record.payload.name : identity.name;
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 160) : fallback;
}
function changeItem(record: ManifestRecord) {
  return { id: record.sourceId, name: label(record, humanResourceType(record.resourceType)), resourceType: record.resourceType, typeLabel: humanResourceType(record.resourceType) };
}
function indexCandidates(records: ReadonlyMap<string, ManifestRecord>) {
  const result = new Map<string, { id: string; label: string; typeLabel: string }[]>();
  for (const record of records.values()) {
    const key = candidateIndexKey(record);
    const candidates = result.get(key) ?? [];
    candidates.push({
      id: record.sourceId,
      label: label(record, humanResourceType(record.resourceType)),
      typeLabel: humanResourceType(record.resourceType),
    });
    result.set(key, candidates);
  }
  for (const [resourceType, candidates] of result) {
    candidates.sort((left, right) =>
      left.label.localeCompare(right.label, "en") ||
      left.id.localeCompare(right.id, "en"),
    );
    result.set(resourceType, candidates);
  }
  return result;
}
function candidateIndexKey(record: ManifestRecord | undefined): string {
  return record
    ? `${record.resourceType}\0${semanticRecordKind(record)}`
    : "unavailable";
}
function semanticRecordKind(record: ManifestRecord): string {
  if (!isObject(record.payload) || typeof record.payload.kind !== "string") {
    return record.resourceType;
  }
  if (record.resourceType === "world-placements") {
    const source = isObject(record.payload.source) ? record.payload.source : {};
    const sourceKind = typeof source.kind === "string" ? source.kind : "unknown";
    return `${record.resourceType}:${sourceKind}`;
  }
  return `${record.resourceType}:${record.payload.kind}`;
}
function collectStrings(value: unknown): Set<string> {
  const result = new Set<string>();
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") result.add(current);
    else if (Array.isArray(current)) {
      for (const child of current as unknown[]) pending.push(child);
    } else if (isObject(current)) {
      for (const child of Object.values(current)) pending.push(child);
    }
  }
  return result;
}
function humanResourceType(value: string) {
  const known: Record<string, string> = { locations: "Location", creatures: "Creature", definitions: "World content", "world-placements": "World placement" };
  return known[value] ?? "World content";
}

function rewriteWorldReferences(value: unknown, mapping: ReadonlyMap<string, string>, resourceType?: string): unknown {
  if (typeof value === "string") {
    if (resourceType) return mapping.get(`${resourceType}\0${value}`) ??
      (resourceType === "creatures" ? mapping.get(`definitions\0${value}`) : undefined) ?? value;
    return value;
  }
  if (Array.isArray(value)) return value.map((child) => rewriteWorldReferences(child, mapping, resourceType));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    rewriteWorldReferences(child, mapping, resourceForField(key)),
  ]));
}
function resourceForField(key: string): string | undefined {
  if (key === "locationId" || key === "parentLocationId") return "locations";
  if (key === "creatureId") return "creatures";
  if (key === "itemDefinitionId" || key === "definitionId" || key === "suggestedCreatureDefinitionId") return "definitions";
  if (key === "capturedWorldPlacementId") return "world-placements";
  return undefined;
}

function rewriteCampaignReferences(value: unknown, mapping: Readonly<Record<string, Readonly<Record<string, string>>>>, targetCampaignId: string, resourceType?: string): unknown {
  if (typeof value === "string") {
    if (resourceType === "campaign-definition") return targetCampaignId;
    if (resourceType) return mapping[resourceType]?.[value] ?? value;
    return value;
  }
  if (Array.isArray(value)) return value.map((child) => rewriteCampaignReferences(child, mapping, targetCampaignId, resourceType));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    rewriteCampaignReferences(
      child,
      mapping,
      targetCampaignId,
      key === "id" ? resourceType : campaignResourceForField(key),
    ),
  ]));
}
function campaignResourceForField(key: string): string | undefined {
  if (key === "campaignDefinitionId") return "campaign-definition";
  if (key === "id") return undefined;
  if (key === "plotDefinitionId" || key === "parentPlotDefinitionId" || key === "plotDefinitionIds") return "plots";
  if (key === "placementDefinitionId" || key === "placementDefinitionIds") return "campaign-placements";
  return undefined;
}

function compareRecords(before: readonly { resourceType: string; sourceId: string; contentHash?: string; payload: unknown }[], after: readonly CampaignDraftRecord[]) {
  const left = new Map(before.map((r) => [`${r.resourceType}\0${r.sourceId}`, r.contentHash ?? canonicalJsonHash(r.payload)]));
  const right = new Map(after.map((r) => [`${r.resourceType}\0${r.sourceId}`, canonicalJsonHash(r.payload)]));
  let added = 0, changed = 0, removed = 0;
  for (const [key, hash] of right) {
    if (!left.has(key)) added += 1;
    else if (left.get(key) !== hash) changed += 1;
  }
  for (const key of left.keys()) if (!right.has(key)) removed++;
  return { added, changed, removed };
}

function visible(value: string | undefined, message: string) {
  const text = value?.trim(); if (!text) throw new BadRequestException(message); return text;
}
function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (!isPublicationJson(value)) throw new BadRequestException("Campaign content must be bounded JSON.");
  return value as Prisma.InputJsonValue;
}
function jsonObject(value: unknown): Prisma.InputJsonObject {
  if (!isObject(value) || !isPublicationJson(value)) throw new BadRequestException("Campaign content must be a bounded JSON object.");
  return value as Prisma.InputJsonObject;
}
function jsonArray(value: unknown): Prisma.InputJsonArray {
  if (!Array.isArray(value) || !isPublicationJson(value)) throw new BadRequestException("Campaign records must be bounded JSON.");
  return value as Prisma.InputJsonArray;
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isPrismaConflict(error: unknown) { return isObject(error) && (error.code === "P2002" || error.code === "P2034"); }
function notFound() { return new NotFoundException("The selected Campaign Definition was not found."); }
function unavailable() { return new ServiceUnavailableException("Campaign Definitions are temporarily unavailable."); }
function staleDraft() { return new ConflictException("The Campaign draft changed; reload before continuing."); }
function staleBase() { return new ConflictException("The published Campaign changed; reload before continuing."); }
function archivedConflict() { return new ConflictException("Restore this archived Campaign Definition before editing or publishing it."); }
