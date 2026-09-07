import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  resolveCreatureInstanceEmbodimentPolicy,
  validateCampaignInstanceRuntimeState,
} from "@aow/common";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
  isCanonicalSnapshotManifest,
  MAX_MIGRATION_EXPANDED_RECORDS,
} from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ApplyCampaignInstanceMigrationDto,
  ApplyCampaignInstanceRestoreDto,
  PreviewCampaignInstanceMigrationDto,
  PreviewCampaignInstanceRestoreDto,
} from "./dto/campaign-instance-migration.dto";

type Client = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CampaignInstanceMigrationsService {
  constructor(private readonly prisma: PrismaService) {}

  preview(
    id: string,
    ownerUserId: string,
    dto: PreviewCampaignInstanceMigrationDto,
    kind: "migration" | "restore" = "migration",
  ) {
    return this.buildPlan(this.prisma, id, ownerUserId, dto, kind);
  }

  async previewRestore(
    id: string,
    ownerUserId: string,
    dto: PreviewCampaignInstanceRestoreDto,
  ) {
    const translated = await this.restoreTarget(this.prisma, id, ownerUserId, dto);
    return this.buildPlan(this.prisma, id, ownerUserId, translated, "restore");
  }

  async applyRestore(
    id: string,
    ownerUserId: string,
    dto: ApplyCampaignInstanceRestoreDto,
  ) {
    const translated = await this.restoreTarget(this.prisma, id, ownerUserId, dto);
    return this.apply(id, ownerUserId, { ...translated, planHash: dto.planHash, mappings: dto.mappings }, "restore");
  }

  async apply(
    id: string,
    ownerUserId: string,
    dto: ApplyCampaignInstanceMigrationDto,
    kind: "migration" | "restore" = "migration",
  ) {
    try {
      return await this.prisma.$transaction(
      async (tx) => {
        // This must be the first transactional statement. SHARE conflicts with
        // Session activation writes, so every subsequent SERIALIZABLE read sees
        // a state in which an ACTIVE Session cannot appear concurrently.
        await tx.$executeRawUnsafe(
          'LOCK TABLE "CampaignInstanceSession" IN SHARE MODE',
        );
        const plan = await this.buildPlan(tx, id, ownerUserId, dto, kind);
        if (!plan.ready || plan.planHash !== dto.planHash) {
          throw new ConflictException(
            "The migration plan changed or still has unresolved conflicts; preview it again.",
          );
        }
        const source = await tx.campaignInstance.findFirst({
          where: { id, ownerUserId, currentSnapshotId: dto.sourceSnapshotId },
          select: {
            id: true,
            name: true,
            status: true,
            campaignDefinitionId: true,
            currentSnapshot: {
              select: {
                id: true,
                snapshotNumber: true,
                campaignDefinitionSnapshot: { select: { manifest: true } },
                worldDefinitionSnapshot: { select: { manifest: true } },
              },
            },
            runtime: {
              select: {
                id: true,
                revision: true,
                state: true,
                extensions: true,
              },
            },
          },
        });
        if (!source?.currentSnapshot || !source.runtime) throw stale();
        if (
          (kind === "migration" && !["PREPARING", "ACTIVE", "PAUSED"].includes(source.status)) ||
          (kind === "restore" && source.status === "ARCHIVED")
        ) {
          throw new ConflictException(
            kind === "migration"
              ? "This Campaign Instance is read-only and cannot migrate."
              : "Restore this archived Campaign Instance to concluded before restoring a version.",
          );
        }
        if (source.runtime.revision !== dto.expectedRuntimeRevision) throw stale();
        const activeSession = await tx.campaignInstanceSession.findFirst({
          where: { campaignInstanceId: id, status: "ACTIVE" },
          select: { name: true },
        });
        if (activeSession) {
          throw new ConflictException(
            `${activeSession.name} must stop before this Campaign Instance can migrate.`,
          );
        }
        const target = await tx.campaignDefinitionSnapshot.findFirst({
          where: {
            id: dto.targetCampaignDefinitionSnapshotId,
            campaignDefinitionId: source.campaignDefinitionId,
            campaignDefinitionRevision: {
              campaignDefinition: { ownerUserId },
            },
          },
          select: {
            id: true,
            campaignDefinitionId: true,
            capturedWorldSnapshotId: true,
            manifest: true,
            contentHash: true,
            capturedAt: true,
            campaignDefinitionRevision: {
              select: {
                id: true,
                revisionNumber: true,
                name: true,
                contentHash: true,
                publishedAt: true,
              },
            },
            capturedWorldSnapshot: {
              select: {
                id: true,
                manifest: true,
                contentHash: true,
                capturedAt: true,
                worldDefinitionRevision: {
                  select: {
                    id: true,
                    worldDefinitionId: true,
                    revisionNumber: true,
                    name: true,
                    contentHash: true,
                    publishedAt: true,
                  },
                },
              },
            },
          },
        });
        if (!target) throw new NotFoundException("The selected Campaign revision was not found.");
        const sourceCampaignManifest =
          source.currentSnapshot.campaignDefinitionSnapshot.manifest;
        const sourceWorldManifest =
          source.currentSnapshot.worldDefinitionSnapshot.manifest;
        if (
          !isCanonicalSnapshotManifest(sourceCampaignManifest) ||
          !isCanonicalSnapshotManifest(sourceWorldManifest) ||
          !isCanonicalSnapshotManifest(target.manifest) ||
          !isCanonicalSnapshotManifest(target.capturedWorldSnapshot.manifest)
        ) {
          throw new ConflictException(
            "The current Campaign Instance snapshot is inconsistent.",
          );
        }
        const sourceRecords = runtimeMigrationRecords(contentRecords([
          ...sourceCampaignManifest.records,
          ...sourceWorldManifest.records,
        ]));
        const targetRecords = runtimeMigrationRecords(contentRecords([
          ...target.manifest.records,
          ...target.capturedWorldSnapshot.manifest.records,
        ]));
        assertExpandedMigrationBound(sourceRecords, "current");
        assertExpandedMigrationBound(targetRecords, "target");
        const normalizedMappings = validateMappings(
          dto.mappings,
          sourceRecords,
          targetRecords,
        );
        const migratedState = rewriteRuntimeReferences(
          source.runtime.state,
          normalizedMappings,
          capturedClosure(
            sourceCampaignManifest,
            sourceWorldManifest,
          ),
        );
        const checkpointCount = await tx.campaignInstanceRuntimeCheckpoint.count({
          where: { campaignInstanceId: id },
        });
        const sourceCheckpoint = await tx.campaignInstanceRuntimeCheckpoint.create({
          data: {
            campaignInstanceId: id,
            campaignInstanceSnapshotId: source.currentSnapshot.id,
            checkpointNumber: checkpointCount + 1,
            reason: kind === "migration" ? "MIGRATION_SOURCE" : "RESTORE_SOURCE",
            runtimeRevision: source.runtime.revision,
            state: source.runtime.state as Prisma.InputJsonValue,
            extensions: source.runtime.extensions as Prisma.InputJsonValue,
            contentHash: canonicalJsonHash(source.runtime.state),
            createdByUserId: ownerUserId,
          },
        });
        const manifest = compatibilityManifest(target);
        const snapshot = await tx.campaignInstanceSnapshot.create({
          data: {
            campaignInstanceId: id,
            campaignDefinitionId: source.campaignDefinitionId,
            campaignDefinitionSnapshotId: target.id,
            worldDefinitionSnapshotId: target.capturedWorldSnapshotId,
            snapshotNumber: source.currentSnapshot.snapshotNumber + 1,
            predecessorSnapshotId: source.currentSnapshot.id,
            reason: kind === "migration" ? "MIGRATION" : "RESTORE",
            manifest: manifest as unknown as Prisma.InputJsonValue,
            contentHash: manifest.contentHash,
            migrationPlan: {
              formatVersion: 1,
              mappings: Object.fromEntries(
                dto.mappings.map(({ resourceType, sourceId, targetId }) => [
                  `${resourceType}:${sourceId}`,
                  targetId,
                ]),
              ),
            },
            createdByUserId: ownerUserId,
          },
        });
        const resultCheckpoint = await tx.campaignInstanceRuntimeCheckpoint.create({
          data: {
            campaignInstanceId: id,
            campaignInstanceSnapshotId: snapshot.id,
            checkpointNumber: checkpointCount + 2,
            reason: kind === "migration" ? "MIGRATION_RESULT" : "RESTORE_RESULT",
            runtimeRevision: source.runtime.revision + 1,
            state: migratedState as Prisma.InputJsonValue,
            extensions: source.runtime.extensions as Prisma.InputJsonValue,
            contentHash: canonicalJsonHash(migratedState),
            createdByUserId: ownerUserId,
          },
        });
        const runtimeChanged = await tx.campaignInstanceRuntime.updateMany({
          where: {
            id: source.runtime.id,
            campaignInstanceId: id,
            campaignInstanceSnapshotId: source.currentSnapshot.id,
            revision: dto.expectedRuntimeRevision,
          },
          data: {
            campaignInstanceSnapshotId: snapshot.id,
            state: migratedState as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
        });
        if (runtimeChanged.count !== 1) throw stale();
        const instanceChanged = await tx.campaignInstance.updateMany({
          where: { id, ownerUserId, currentSnapshotId: source.currentSnapshot.id },
          data: { currentSnapshotId: snapshot.id, metadataRevision: { increment: 1 } },
        });
        if (instanceChanged.count !== 1) throw stale();
        await tx.campaignInstanceMigrationAudit.create({
          data: {
            campaignInstanceId: id,
            kind: kind === "migration" ? "MIGRATION" : "RESTORE",
            sourceSnapshotId: source.currentSnapshot.id,
            resultSnapshotId: snapshot.id,
            sourceRuntimeCheckpointId: sourceCheckpoint.id,
            resultRuntimeCheckpointId: resultCheckpoint.id,
            resolutionPlan: {
              formatVersion: 1,
              mappings: Object.fromEntries(
                dto.mappings.map(({ resourceType, sourceId, targetId }) => [
                  `${resourceType}:${sourceId}`,
                  targetId,
                ]),
              ),
            },
            planHash: plan.planHash,
            createdByUserId: ownerUserId,
          },
        });
        await tx.campaignInstanceAuditEvent.create({
          data: {
            campaignInstanceId: id,
            actorUserId: ownerUserId,
            action:
              kind === "migration"
                ? "instance.version.migrated"
                : "instance.version.restored",
            subjectName: source.name,
            subjectType: "Campaign Instance",
            detail: {
              kind,
              sourceSnapshotNumber: source.currentSnapshot.snapshotNumber,
              resultSnapshotNumber: snapshot.snapshotNumber,
              targetCampaignName: target.campaignDefinitionRevision.name,
              targetCampaignRevision:
                target.campaignDefinitionRevision.revisionNumber,
              targetWorldName:
                target.capturedWorldSnapshot.worldDefinitionRevision.name,
              targetWorldRevision:
                target.capturedWorldSnapshot.worldDefinitionRevision.revisionNumber,
            },
          },
        });
        return {
          campaignInstanceId: id,
          campaignInstanceName: source.name,
          kind,
          snapshot: {
            snapshotId: snapshot.id,
            snapshotNumber: snapshot.snapshotNumber,
            reason: snapshot.reason.toLowerCase(),
            adoptedAt: snapshot.adoptedAt.toISOString(),
            campaignDefinition: {
              name: target.campaignDefinitionRevision.name,
              revisionNumber: target.campaignDefinitionRevision.revisionNumber,
              authoringHref: `/campaigns/definitions/${target.campaignDefinitionId}`,
            },
            worldDefinition: {
              name: target.capturedWorldSnapshot.worldDefinitionRevision.name,
              revisionNumber:
                target.capturedWorldSnapshot.worldDefinitionRevision.revisionNumber,
              authoringHref: `/worlds/${target.capturedWorldSnapshot.worldDefinitionRevision.worldDefinitionId}`,
            },
            current: true,
          },
          runtimeRevision: source.runtime.revision + 1,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2002") || isPrismaCode(error, "P2034")) {
        throw stale();
      }
      throw error;
    }
  }

  private async buildPlan(
    client: Client,
    id: string,
    ownerUserId: string,
    dto: PreviewCampaignInstanceMigrationDto,
    kind: "migration" | "restore",
  ) {
    const instance = await client.campaignInstance.findFirst({
      where: { id, ownerUserId },
      select: {
        id: true,
        name: true,
        status: true,
        campaignDefinitionId: true,
        currentSnapshotId: true,
        currentSnapshot: {
          select: {
            id: true,
            snapshotNumber: true,
            reason: true,
            adoptedAt: true,
            predecessorSnapshotId: true,
            campaignDefinitionSnapshotId: true,
            campaignDefinitionSnapshot: {
              select: {
                manifest: true,
                campaignDefinitionRevision: {
                  select: { id: true, name: true, revisionNumber: true, campaignDefinitionId: true },
                },
              },
            },
            worldDefinitionSnapshot: {
              select: {
                manifest: true,
                worldDefinitionRevision: {
                  select: { name: true, revisionNumber: true, worldDefinitionId: true },
                },
              },
            },
          },
        },
        runtime: { select: { revision: true, state: true } },
      },
    });
    if (!instance?.currentSnapshot || !instance.runtime) throw notFound();
    if (
      (kind === "migration" && !["PREPARING", "ACTIVE", "PAUSED"].includes(instance.status)) ||
      (kind === "restore" && instance.status === "ARCHIVED")
    ) {
      throw new ConflictException(
        kind === "migration"
          ? "This Campaign Instance is read-only and cannot migrate."
          : "Restore this archived Campaign Instance to concluded before restoring a version.",
      );
    }
    if (
      instance.currentSnapshot.id !== dto.sourceSnapshotId ||
      instance.runtime.revision !== dto.expectedRuntimeRevision
    ) throw stale();
    if (kind === "restore") {
      const predecessor = await client.campaignInstanceSnapshot.findFirst({
        where: {
          id: instance.currentSnapshot.predecessorSnapshotId ?? "",
          campaignInstanceId: id,
          campaignDefinitionSnapshotId: dto.targetCampaignDefinitionSnapshotId,
        },
        select: { id: true },
      });
      if (!predecessor) {
        throw new BadRequestException("Restore must target the current snapshot's direct predecessor.");
      }
    }
    const target = await client.campaignDefinitionSnapshot.findFirst({
      where: {
        id: dto.targetCampaignDefinitionSnapshotId,
        campaignDefinitionId: instance.campaignDefinitionId,
        campaignDefinitionRevision: {
          campaignDefinition: { ownerUserId },
        },
      },
      select: {
        id: true,
        contentHash: true,
        manifest: true,
        campaignDefinitionRevision: {
          select: {
            id: true,
            campaignDefinitionId: true,
            predecessorRevisionId: true,
            name: true,
            revisionNumber: true,
            contentHash: true,
          },
        },
        capturedWorldSnapshot: {
          select: {
            id: true,
            contentHash: true,
            manifest: true,
            worldDefinitionRevision: {
              select: {
                id: true,
                name: true,
                revisionNumber: true,
                worldDefinitionId: true,
                contentHash: true,
              },
            },
          },
        },
      },
    });
    if (!target) {
      throw new NotFoundException("The selected Campaign revision was not found.");
    }
    assertTargetIntegrity(target);
    if (
      kind === "migration" &&
      target.campaignDefinitionRevision.predecessorRevisionId !==
        instance.currentSnapshot.campaignDefinitionSnapshot.campaignDefinitionRevision.id
    ) {
      throw new BadRequestException("Migration must target the direct successor Campaign revision.");
    }
    const active = await client.campaignInstanceSession.findFirst({
      where: { campaignInstanceId: id, status: "ACTIVE" },
      select: { name: true },
    });
    const runtimeCharacterIds = await capturedCharacterIds(client, id);
    const sourceManifest = instance.currentSnapshot.campaignDefinitionSnapshot.manifest;
    const sourceWorldManifest = instance.currentSnapshot.worldDefinitionSnapshot.manifest;
    if (
      !isCanonicalSnapshotManifest(sourceManifest) ||
      !isCanonicalSnapshotManifest(sourceWorldManifest) ||
      !isCanonicalSnapshotManifest(target.manifest) ||
      !isCanonicalSnapshotManifest(target.capturedWorldSnapshot.manifest)
    ) {
      throw new ConflictException("The current Campaign Instance snapshot is inconsistent.");
    }
    const submittedMapping = new Map(
      (dto.mappings ?? []).map((item) => [
        `${item.resourceType}:${item.sourceId}`,
        item.targetId,
      ]),
    );
    const sourceRecords = runtimeMigrationRecords(contentRecords([
      ...sourceManifest.records,
      ...sourceWorldManifest.records,
    ]));
    const targetRecords = runtimeMigrationRecords(contentRecords([
      ...target.manifest.records,
      ...target.capturedWorldSnapshot.manifest.records,
    ]));
    assertExpandedMigrationBound(sourceRecords, "current");
    assertExpandedMigrationBound(targetRecords, "target");
    const mapping = validateMappings(dto.mappings ?? [], sourceRecords, targetRecords);
    const targetByKey = new Map(
      targetRecords.map((record) => [`${record.resourceType}:${record.sourceId}`, record]),
    );
    const changes: Array<{ subjectName: string; typeLabel: string; change: "added" | "changed" | "removed" }> = [];
    const conflicts: Array<{ key: string; resourceType: string; sourceId?: string; subjectName: string; typeLabel: string; detail: string; mappingRequired: boolean }> = [];
    const claimedTargetKeys = new Set<string>();
    for (const sourceRecord of sourceRecords) {
      const mappedId =
        submittedMapping.get(`${sourceRecord.resourceType}:${sourceRecord.sourceId}`) ??
        sourceRecord.sourceId;
      const targetRecord = targetByKey.get(`${sourceRecord.resourceType}:${mappedId}`);
      const subjectName = humanName(sourceRecord.payload, sourceRecord.resourceType);
      if (!targetRecord) {
        changes.push({ subjectName, typeLabel: sourceRecord.resourceType, change: "removed" });
        conflicts.push({
          key: `${sourceRecord.resourceType}:${sourceRecord.sourceId}`,
          resourceType: sourceRecord.resourceType,
          sourceId: sourceRecord.sourceId,
          subjectName,
          typeLabel: sourceRecord.resourceType,
          detail: "This captured record has no direct-lineage successor or approved mapping.",
          mappingRequired: true,
        });
      } else if (targetRecord.contentHash !== sourceRecord.contentHash) {
        changes.push({ subjectName, typeLabel: sourceRecord.resourceType, change: "changed" });
      }
      if (targetRecord) {
        claimedTargetKeys.add(`${targetRecord.resourceType}:${targetRecord.sourceId}`);
      }
      targetByKey.delete(`${sourceRecord.resourceType}:${mappedId}`);
    }
    for (const record of targetByKey.values()) {
      changes.push({
        subjectName: humanName(record.payload, record.resourceType),
        typeLabel: record.resourceType,
        change: "added",
      });
    }
    if (active) {
      conflicts.unshift({
        key: "active-session",
        resourceType: "sessions",
        subjectName: active.name,
        typeLabel: "Session",
        detail: `${active.name} must stop before migration can be applied.`,
        mappingRequired: false,
      });
    }
    const migratedState = rewriteRuntimeReferences(
      instance.runtime.state,
      mapping,
      capturedClosure(sourceManifest, sourceWorldManifest),
    );
    const validation = validateTargetRuntime(
      migratedState,
      id,
      instance.currentSnapshot.id,
      target.manifest,
      target.capturedWorldSnapshot.manifest,
      runtimeCharacterIds,
    );
    for (const issue of validation) {
      conflicts.push({
        key: `runtime:${issue.code}:${issue.subject}`,
        resourceType: "campaign-instance-runtime",
        subjectName: issue.subject,
        typeLabel: "Instance runtime",
        detail: issue.detail,
        mappingRequired: false,
      });
    }
    conflicts.sort((left, right) => left.key.localeCompare(right.key));
    changes.sort(compareChange);
    const semantic = {
      kind,
      sourceSnapshotId: dto.sourceSnapshotId,
      targetCampaignDefinitionSnapshotId: dto.targetCampaignDefinitionSnapshotId,
      expectedRuntimeRevision: dto.expectedRuntimeRevision,
      mappings: [...submittedMapping].sort(([left], [right]) => left.localeCompare(right)),
      changes,
      conflicts: conflicts.map(
        ({ key, resourceType, sourceId, mappingRequired }) => ({
          key,
          resourceType,
          ...(sourceId ? { sourceId } : {}),
          mappingRequired,
        }),
      ),
    };
    const changeOffset = dto.changeOffset ?? 0;
    const changeLimit = dto.changeLimit ?? 100;
    const conflictOffset = dto.conflictOffset ?? 0;
    const conflictLimit = dto.conflictLimit ?? 100;
    const candidateOffset = dto.candidateOffset ?? 0;
    const candidateLimit = dto.candidateLimit ?? 100;
    const candidatePage = pageMappingCandidates(
      conflicts,
      sourceRecords,
      targetRecords,
      claimedTargetKeys,
      submittedMapping,
      candidateOffset,
      candidateLimit,
    );
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      kind,
      source: {
        snapshotId: instance.currentSnapshot.id,
        snapshotNumber: instance.currentSnapshot.snapshotNumber,
        reason: instance.currentSnapshot.reason.toLowerCase(),
        adoptedAt: instance.currentSnapshot.adoptedAt.toISOString(),
        campaignDefinition: revisionLink(
          instance.currentSnapshot.campaignDefinitionSnapshot.campaignDefinitionRevision,
          "campaign",
        ),
        worldDefinition: revisionLink(
          instance.currentSnapshot.worldDefinitionSnapshot.worldDefinitionRevision,
          "world",
        ),
        current: true,
      },
      target: {
        campaignDefinition: revisionLink(target.campaignDefinitionRevision, "campaign"),
        worldDefinition: revisionLink(target.capturedWorldSnapshot.worldDefinitionRevision, "world"),
      },
      planHash: canonicalJsonHash(semantic),
      expectedRuntimeRevision: dto.expectedRuntimeRevision,
      ready: conflicts.length === 0,
      conflicts: conflicts.slice(conflictOffset, conflictOffset + conflictLimit),
      mappingCandidates: candidatePage.items,
      changes: changes.slice(changeOffset, changeOffset + changeLimit),
      totalChanges: changes.length,
      changeOffset,
      changeLimit,
      nextChangeOffset:
        changeOffset + changeLimit < changes.length
          ? changeOffset + changeLimit
          : undefined,
      totalConflicts: conflicts.length,
      conflictOffset,
      conflictLimit,
      nextConflictOffset:
        conflictOffset + conflictLimit < conflicts.length
          ? conflictOffset + conflictLimit
          : undefined,
      totalMappingCandidates: candidatePage.total,
      candidateOffset,
      candidateLimit,
      nextCandidateOffset:
        candidateOffset + candidateLimit < candidatePage.total
          ? candidateOffset + candidateLimit
          : undefined,
    };
  }

  private async restoreTarget(
    client: Client,
    id: string,
    ownerUserId: string,
    dto: PreviewCampaignInstanceRestoreDto,
  ): Promise<PreviewCampaignInstanceMigrationDto> {
    const current = await client.campaignInstance.findFirst({
      where: { id, ownerUserId, currentSnapshotId: dto.sourceSnapshotId },
      select: {
        currentSnapshot: { select: { predecessorSnapshotId: true } },
      },
    });
    if (!current?.currentSnapshot) throw notFound();
    if (current.currentSnapshot.predecessorSnapshotId !== dto.targetInstanceSnapshotId) {
      throw new BadRequestException(
        "Restore must target the current Instance snapshot's direct predecessor.",
      );
    }
    const target = await client.campaignInstanceSnapshot.findFirst({
      where: { id: dto.targetInstanceSnapshotId, campaignInstanceId: id },
      select: { campaignDefinitionSnapshotId: true },
    });
    if (!target) throw notFound();
    return {
      sourceSnapshotId: dto.sourceSnapshotId,
      targetCampaignDefinitionSnapshotId:
        target.campaignDefinitionSnapshotId as PreviewCampaignInstanceMigrationDto["targetCampaignDefinitionSnapshotId"],
      expectedRuntimeRevision: dto.expectedRuntimeRevision,
      mappings: dto.mappings,
      changeOffset: dto.changeOffset,
      changeLimit: dto.changeLimit,
      conflictOffset: dto.conflictOffset,
      conflictLimit: dto.conflictLimit,
      candidateOffset: dto.candidateOffset,
      candidateLimit: dto.candidateLimit,
    };
  }
}

interface CompatibilityTarget {
  readonly id: string;
  readonly contentHash: string;
  readonly capturedAt: Date;
  readonly manifest: unknown;
  readonly campaignDefinitionRevision: {
    readonly id: string;
    readonly revisionNumber: number;
    readonly contentHash: string;
  };
  readonly capturedWorldSnapshot: {
    readonly id: string;
    readonly contentHash: string;
    readonly capturedAt: Date;
    readonly manifest: unknown;
    readonly worldDefinitionRevision: {
      readonly id: string;
      readonly revisionNumber: number;
      readonly contentHash: string;
    };
  };
}

function compatibilityManifest(target: CompatibilityTarget) {
  return buildSnapshotManifest(1, [
    {
      resourceType: "campaign-definition-snapshot",
      sourceId: target.id,
      sourceRevision: target.campaignDefinitionRevision.revisionNumber,
      payload: {
        snapshotId: target.id,
        snapshotContentHash: target.contentHash,
        capturedAt: target.capturedAt.toISOString(),
        revisionId: target.campaignDefinitionRevision.id,
        revisionNumber: target.campaignDefinitionRevision.revisionNumber,
        revisionContentHash: target.campaignDefinitionRevision.contentHash,
        manifest: target.manifest,
      },
    },
    {
      resourceType: "world-definition-snapshot",
      sourceId: target.capturedWorldSnapshot.id,
      sourceRevision: target.capturedWorldSnapshot.worldDefinitionRevision.revisionNumber,
      payload: {
        snapshotId: target.capturedWorldSnapshot.id,
        snapshotContentHash: target.capturedWorldSnapshot.contentHash,
        capturedAt: target.capturedWorldSnapshot.capturedAt.toISOString(),
        revisionId: target.capturedWorldSnapshot.worldDefinitionRevision.id,
        revisionNumber: target.capturedWorldSnapshot.worldDefinitionRevision.revisionNumber,
        revisionContentHash: target.capturedWorldSnapshot.worldDefinitionRevision.contentHash,
        manifest: target.capturedWorldSnapshot.manifest,
      },
    },
  ]);
}

function assertTargetIntegrity(target: {
  id: string;
  contentHash: string;
  manifest: unknown;
  campaignDefinitionRevision: { id: string; revisionNumber: number; contentHash: string };
  capturedWorldSnapshot: {
    id: string;
    contentHash: string;
    manifest: unknown;
    worldDefinitionRevision: { id: string; revisionNumber: number; contentHash: string };
  };
}) {
  if (
    !isCanonicalSnapshotManifest(target.manifest) ||
    target.manifest.contentHash !== target.contentHash ||
    !isCanonicalSnapshotManifest(target.capturedWorldSnapshot.manifest) ||
    target.capturedWorldSnapshot.manifest.contentHash !==
      target.capturedWorldSnapshot.contentHash ||
    !hasRevisionRecord(
      target.manifest,
      "campaign-definition-revision",
      target.campaignDefinitionRevision,
    ) ||
    !hasRevisionRecord(
      target.capturedWorldSnapshot.manifest,
      "world-definition-revision",
      target.capturedWorldSnapshot.worldDefinitionRevision,
    )
  ) {
    throw new ConflictException("The selected Campaign and World capture is inconsistent.");
  }
}

function hasRevisionRecord(
  manifest: unknown,
  resourceType: string,
  revision: { id: string; revisionNumber: number; contentHash: string },
) {
  return (
    isCanonicalSnapshotManifest(manifest) &&
    manifest.records.some(
      (record) =>
        record.resourceType === resourceType &&
        record.sourceId === revision.id &&
        record.sourceRevision === revision.revisionNumber &&
        record.contentHash === revision.contentHash,
    )
  );
}

interface CapturedClosure {
  readonly records: readonly {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly payload: unknown;
  }[];
  readonly extensionSchemas: ReadonlyMap<string, Record<string, unknown>>;
  readonly modelFieldsByStorageKey: ReadonlyMap<string, Record<string, unknown>>;
  readonly modelElementsById: ReadonlyMap<string, Record<string, unknown>>;
  readonly modelSchemaReleaseIds: readonly string[];
}

export function capturedClosure(
  campaignManifest: unknown,
  worldManifest: unknown,
): CapturedClosure | undefined {
  if (
    !isCanonicalSnapshotManifest(campaignManifest) ||
    !isCanonicalSnapshotManifest(worldManifest)
  ) return undefined;
  const records = [...campaignManifest.records, ...worldManifest.records];
  const extensionSchemas = new Map<string, Record<string, unknown>>();
  const modelFieldsByStorageKey = new Map<string, Record<string, unknown>>();
  const modelElementsById = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const payload = recordObject(record.payload);
    if (
      record.resourceType === "extension-schemas" &&
      typeof payload.key === "string" &&
      Object.keys(recordObject(payload.jsonSchema)).length > 0
    ) {
      extensionSchemas.set(payload.key, recordObject(payload.jsonSchema));
    }
    const element = modelElementPayload(payload);
    if (record.resourceType === "model-elements" && element) {
      modelElementsById.set(record.sourceId, element);
    }
    if (
      record.resourceType === "model-elements" &&
      element?.kind === "field" &&
      typeof element.storageKey === "string"
    ) {
      modelFieldsByStorageKey.set(element.storageKey, element);
    }
  }
  return {
    records,
    extensionSchemas,
    modelFieldsByStorageKey,
    modelElementsById,
    modelSchemaReleaseIds: records
      .filter((record) => record.resourceType === "model-schema-releases")
      .map((record) => record.sourceId),
  };
}

/**
 * Rewrites only reference-bearing paths declared by CampaignInstanceRuntimeState.
 * Arbitrary prose and ungoverned extension strings are deliberately untouched.
 */
export function rewriteRuntimeReferences(
  value: unknown,
  mappings: ReadonlyMap<string, string>,
  closure?: CapturedClosure,
): unknown {
  const state = requiredRecord(value, "Campaign Instance runtime");
  const preparation = requiredRecord(state.preparation, "Instance preparation");
  return {
    ...state,
    formatVersion: 1,
    preparation: rewriteGoverned({
      ...preparation,
      ...(typeof preparation.startingLocationId === "string"
        ? { startingLocationId: mapped(mappings, "locations", preparation.startingLocationId) }
        : {}),
      ...(Array.isArray(preparation.locationCanvases)
        ? {
            locationCanvases: preparation.locationCanvases.map((entry) => {
              const canvas = requiredRecord(entry, "Location canvas");
              return rewriteGoverned({
                ...canvas,
                locationId: mapped(mappings, "locations", requiredString(canvas.locationId, "Location canvas")),
              }, mappings, closure);
            }),
          }
        : {}),
    }, mappings, closure),
    plotProgress: requiredArray(state.plotProgress, "Plot progress").map((entry) => {
      const progress = requiredRecord(entry, "Plot progress");
      const sourcePlotId = requiredString(progress.plotDefinitionId, "Plot progress");
      return rewriteGoverned({
        ...progress,
        plotDefinitionId: mapped(mappings, "plots", sourcePlotId),
        ...(Array.isArray(progress.objectiveProgress)
          ? { objectiveProgress: progress.objectiveProgress.map((value) => {
              const objective = requiredRecord(value, "Objective progress");
              return {
                ...objective,
                objectiveId: mappedScoped(
                  mappings,
                  "plot-objectives",
                  [sourcePlotId],
                  requiredString(objective.objectiveId, "Objective progress"),
                ),
              };
            }) }
          : {}),
        ...(Array.isArray(progress.revealedClaimIds)
          ? { revealedClaimIds: progress.revealedClaimIds.map((claimId) => mappedScoped(
              mappings,
              "plot-claims",
              [sourcePlotId],
              requiredString(claimId, "Revealed claim"),
            )) }
          : {}),
        ...(Array.isArray(progress.creatureKnowledge)
          ? { creatureKnowledge: progress.creatureKnowledge.map((value) => {
              const knowledge = requiredRecord(value, "Creature knowledge");
              return {
                ...knowledge,
                claimId: mappedScoped(
                  mappings,
                  "plot-claims",
                  [sourcePlotId],
                  requiredString(knowledge.claimId, "Creature knowledge"),
                ),
              };
            }) }
          : {}),
        ...(Array.isArray(progress.locationRealizations)
          ? { locationRealizations: progress.locationRealizations.map((value) => {
              const location = requiredRecord(value, "Plot Location realization");
              const sourceContextId = requiredString(
                location.plotLocationContextId,
                "Plot Location realization",
              );
              return {
                ...location,
                plotLocationContextId: mappedScoped(
                  mappings,
                  "plot-location-contexts",
                  [sourcePlotId],
                  sourceContextId,
                ),
                actors: requiredArray(location.actors, "Plot actor realizations").map((actorValue) => {
                  const actor = requiredRecord(actorValue, "Plot actor realization");
                  return {
                    ...actor,
                    actorPlacementIntentId: mappedScoped(
                      mappings,
                      "plot-actor-intents",
                      [sourcePlotId, sourceContextId],
                      requiredString(actor.actorPlacementIntentId, "Plot actor realization"),
                    ),
                  };
                }),
                items: requiredArray(location.items, "Plot Item realizations").map((itemValue) => {
                  const item = requiredRecord(itemValue, "Plot Item realization");
                  return {
                    ...item,
                    itemPlacementIntentId: mappedScoped(
                      mappings,
                      "plot-item-intents",
                      [sourcePlotId, sourceContextId],
                      requiredString(item.itemPlacementIntentId, "Plot Item realization"),
                    ),
                  };
                }),
              };
            }) }
          : {}),
      }, mappings, closure);
    }),
    placementRealizations: requiredArray(state.placementRealizations, "Placement realizations").map((entry) => {
      const realization = requiredRecord(entry, "Placement realization");
      const source = requiredRecord(realization.source, "Placement source");
      return rewriteGoverned({
        ...realization,
        source: source.kind === "campaign-placement"
          ? {
              ...source,
              campaignPlacementDefinitionId: mapped(mappings, "campaign-placements", requiredString(source.campaignPlacementDefinitionId, "Campaign placement source")),
              ...(typeof source.capturedWorldPlacementDefinitionId === "string"
                ? { capturedWorldPlacementDefinitionId: mapped(mappings, "world-placements", source.capturedWorldPlacementDefinitionId) }
                : {}),
            }
          : source.kind === "captured-world-placement"
            ? {
                ...source,
                worldPlacementDefinitionId: mapped(mappings, "world-placements", requiredString(source.worldPlacementDefinitionId, "World placement source")),
              }
            : source,
        sourceLocationId: mapped(mappings, "locations", requiredString(realization.sourceLocationId, "Placement realization")),
        ...(typeof realization.currentLocationId === "string"
          ? { currentLocationId: mapped(mappings, "locations", realization.currentLocationId) }
          : {}),
      }, mappings, closure);
    }),
    creatureEmbodiments: requiredArray(state.creatureEmbodiments, "Creature embodiments").map((entry) => {
      const embodiment = requiredRecord(entry, "Creature embodiment");
      const source = requiredRecord(embodiment.source, "Creature source");
      const creature = requiredRecord(embodiment.creature, "Creature overlay");
      return rewriteGoverned({
        ...embodiment,
        source: source.kind === "captured-world-creature"
          ? { ...source, sourceCreatureId: mapped(mappings, "definitions", requiredString(source.sourceCreatureId, "Creature source")) }
          : source.kind === "campaign-placement"
            ? {
                ...source,
                campaignPlacementDefinitionId: mapped(mappings, "campaign-placements", requiredString(source.campaignPlacementDefinitionId, "Creature source")),
                ...(typeof source.sourceCreatureId === "string"
                  ? { sourceCreatureId: mapped(mappings, "definitions", source.sourceCreatureId) }
                  : {}),
              }
            : source,
        creature: rewriteGoverned({
          ...creature,
          ...(typeof creature.definitionId === "string"
            ? { definitionId: mapped(mappings, "definitions", creature.definitionId) }
            : {}),
          ...(typeof creature.currentLocationId === "string"
            ? { currentLocationId: mapped(mappings, "locations", creature.currentLocationId) }
            : {}),
        }, mappings, closure),
      }, mappings, closure);
    }),
    itemInstances: requiredArray(state.itemInstances, "Item instances").map((entry) => {
      const item = requiredRecord(entry, "Item instance");
      const location = requiredRecord(item.location, "Item location");
      return rewriteGoverned({
        ...item,
        definitionId: mapped(mappings, "definitions", requiredString(item.definitionId, "Item instance")),
        location: location.kind === "location"
          ? { ...location, locationId: mapped(mappings, "locations", requiredString(location.locationId, "Item location")) }
          : location,
      }, mappings, closure);
    }),
  };
}

function mapped(
  mappings: ReadonlyMap<string, string>,
  resourceType: string,
  value: string,
) {
  return mappings.get(`${resourceType}:${value}`) ?? value;
}

/** Bounded opaque address for a Plot-owned component; never use as a visible label. */
export function scopedMigrationReference(
  scope: readonly string[],
  value: string,
): string {
  return `nested:${canonicalJsonHash([...scope, value])}`;
}

function mappedScoped(
  mappings: ReadonlyMap<string, string>,
  resourceType: string,
  scope: readonly string[],
  value: string,
) {
  return mapped(mappings, resourceType, scopedMigrationReference(scope, value));
}

function rewriteGoverned(
  value: Record<string, unknown>,
  mappings: ReadonlyMap<string, string>,
  closure?: CapturedClosure,
): Record<string, unknown> {
  const conformance = recordObject(value.conformance);
  const modelValues = recordObject(value.modelValues);
  const extensions = recordObject(value.extensions);
  return {
    ...value,
    ...(Object.keys(conformance).length > 0
      ? {
          conformance: {
            ...conformance,
            ...(Array.isArray(conformance.modelSchemaReleaseIds)
              ? { modelSchemaReleaseIds: (conformance.modelSchemaReleaseIds as unknown[]).map((id) =>
                  typeof id === "string" ? mapped(mappings, "model-schema-releases", id) : id) }
              : {}),
            ...(typeof conformance.conceptId === "string"
              ? { conceptId: mapped(mappings, "model-elements", conformance.conceptId) }
              : {}),
          },
        }
      : {}),
    ...(Object.keys(modelValues).length > 0
      ? { modelValues: rewriteModelValues(modelValues, mappings, closure) }
      : {}),
    ...(Object.keys(extensions).length > 0
      ? { extensions: rewriteExtensions(extensions, mappings, closure) }
      : {}),
  };
}

function rewriteModelValues(
  values: Record<string, unknown>,
  mappings: ReadonlyMap<string, string>,
  closure?: CapturedClosure,
) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const field = closure?.modelFieldsByStorageKey.get(key);
    return [key, field ? rewriteModelValue(value, recordObject(field.valueType), mappings) : value];
  }));
}

function rewriteModelValue(
  value: unknown,
  valueType: Record<string, unknown>,
  mappings: ReadonlyMap<string, string>,
): unknown {
  if (valueType.kind === "list" && Array.isArray(value)) {
    const item = recordObject(valueType.item);
    return value.map((entry) => rewriteModelValue(entry, item, mappings));
  }
  if (typeof value !== "string") return value;
  if (valueType.kind === "definition-reference")
    return mapped(mappings, "definitions", value);
  if (valueType.kind === "vocabulary-option-reference")
    return mapped(mappings, "model-elements", value);
  return value;
}

function rewriteExtensions(
  extensions: Record<string, unknown>,
  mappings: ReadonlyMap<string, string>,
  closure?: CapturedClosure,
) {
  return Object.fromEntries(Object.entries(extensions).map(([key, value]) => {
    const schema = closure?.extensionSchemas.get(key);
    return [key, schema ? rewriteSchemaReferences(value, schema, mappings) : value];
  }));
}

function rewriteSchemaReferences(
  value: unknown,
  schema: Record<string, unknown>,
  mappings: ReadonlyMap<string, string>,
): unknown {
  const resourceType = schema["x-aow-reference-resource"];
  if (typeof resourceType === "string" && typeof value === "string")
    return mapped(mappings, resourceType, value);
  if (Array.isArray(value)) {
    const itemSchema = recordObject(schema.items);
    return Object.keys(itemSchema).length > 0
      ? value.map((entry) => rewriteSchemaReferences(entry, itemSchema, mappings))
      : value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = recordObject(schema.properties);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const childSchema = recordObject(properties[key]);
      return [key, Object.keys(childSchema).length > 0
        ? rewriteSchemaReferences(child, childSchema, mappings)
        : child];
    }));
  }
  return value;
}

function requiredRecord(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException(`${subject} is malformed.`);
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, subject: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new BadRequestException(`${subject} is malformed.`);
  return value;
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new BadRequestException(`${subject} has an invalid reference.`);
  return value;
}

function modelElementPayload(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const revision = recordObject(value.revision);
  const revisionPayload = recordObject(revision.payload);
  if (Object.keys(revisionPayload).length > 0) return revisionPayload;
  const payload = recordObject(value.payload);
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function validateTargetRuntime(
  state: unknown,
  campaignInstanceId: string,
  campaignInstanceSnapshotId: string,
  campaignManifestValue: unknown,
  worldManifestValue: unknown,
  runtimeCharacterIds: ReadonlySet<string> = new Set(),
) {
  if (
    !isCanonicalSnapshotManifest(campaignManifestValue) ||
    !isCanonicalSnapshotManifest(worldManifestValue)
  ) {
    return [
      {
        code: "captured-pair-invalid",
        subject: "Captured Campaign and World pair",
        detail: "The target captured pair is inconsistent.",
      },
    ];
  }
  const campaignRecords = campaignManifestValue.records;
  const worldRecords = worldManifestValue.records;
  const objectives = new Map(
    campaignRecords
      .filter((record) => record.resourceType === "plots")
      .map((record) => [
        record.sourceId,
        new Set(
          (Array.isArray(recordObject(record.payload).objectives)
            ? (recordObject(record.payload).objectives as unknown[])
            : [])
            .map((objective) => recordObject(objective).id)
            .filter((id): id is string => typeof id === "string"),
        ),
      ]),
  );
  const locations = new Set(
    worldRecords
      .filter((record) => record.resourceType === "locations")
      .map((record) => record.sourceId),
  );
  const campaignPlacements = new Set(
    campaignRecords
      .filter((record) => record.resourceType === "campaign-placements")
      .map((record) => record.sourceId),
  );
  const definitions = new Set(
    worldRecords
      .filter((record) => record.resourceType === "definitions")
      .map((record) => record.sourceId),
  );
  const modelSchemaReleases = new Set(
    [...campaignRecords, ...worldRecords]
      .filter((record) => record.resourceType === "model-schema-releases")
      .map((record) => record.sourceId),
  );
  const modelElements = new Set(
    [...campaignRecords, ...worldRecords]
      .filter((record) => record.resourceType === "model-elements")
      .map((record) => record.sourceId),
  );
  const worldPlacements = new Set(
    worldRecords
      .filter((record) => record.resourceType === "world-placements")
      .map((record) => record.sourceId),
  );
  const closure = capturedClosure(campaignManifestValue, worldManifestValue);
  const capturedCreaturePolicies = new Map();
  const policyIssues: Array<{ code: string; subject: string; detail: string }> = [];
  for (const record of worldRecords) {
    const payload = recordObject(record.payload);
    if (record.resourceType !== "definitions" || payload.kind !== "creature") continue;
    const policy = resolveCreatureInstanceEmbodimentPolicy(
      payload.instanceEmbodimentPolicy,
    );
    if (
      !policy ||
      (policy.policy.strategy !== "one-per-instance" &&
        policy.policy.strategy !== "one-per-realization")
    ) {
      policyIssues.push({
        code: "creature-policy-unresolved",
        subject: humanName(record.payload, "Captured Creature"),
        detail: "A captured Creature has a malformed or unsupported embodiment policy.",
      });
      continue;
    }
    capturedCreaturePolicies.set(record.sourceId, policy);
  }
  try {
    const result = validateCampaignInstanceRuntimeState(state as never, {
      campaignInstanceId,
      campaignInstanceSnapshotId,
      capturedPlotObjectiveIds: objectives,
      capturedLocationIds: locations,
      capturedCampaignPlacementIds: campaignPlacements,
      capturedWorldPlacementIds: worldPlacements,
      capturedCreaturePolicies,
    } as never).issues;
    return [
      ...policyIssues,
      ...result,
      ...validateRuntimeNestedReferences(
        state,
        campaignRecords,
        definitions,
        locations,
        modelSchemaReleases,
        modelElements,
        closure,
        runtimeCharacterIds,
      ),
    ];
  } catch {
    return [
      {
        code: "runtime-invalid",
        subject: "Instance runtime",
        detail: "The current runtime cannot conform to the target captured pair.",
      },
    ];
  }
}

function validateRuntimeNestedReferences(
  stateValue: unknown,
  campaignRecords: readonly { resourceType: string; sourceId: string; payload: unknown }[],
  definitions: ReadonlySet<string>,
  locations: ReadonlySet<string>,
  modelSchemaReleases: ReadonlySet<string>,
  modelElements: ReadonlySet<string>,
  closure: CapturedClosure | undefined,
  runtimeCharacterIds: ReadonlySet<string>,
) {
  const issues: Array<{ code: string; subject: string; detail: string }> = [];
  const state = recordObject(stateValue);
  const embodiments = Array.isArray(state.creatureEmbodiments)
    ? state.creatureEmbodiments.map(recordObject)
    : [];
  const entityIds = new Set(
    embodiments.flatMap((entry) =>
      typeof entry.runtimeEntityId === "string" ? [entry.runtimeEntityId] : [],
    ),
  );
  const itemInstances = Array.isArray(state.itemInstances)
    ? state.itemInstances.map(recordObject)
    : [];
  const itemIds = new Set(
    itemInstances.flatMap((item) => (typeof item.id === "string" ? [item.id] : [])),
  );
  const realizationIds = new Set(
    (Array.isArray(state.placementRealizations) ? state.placementRealizations : [])
      .map(recordObject)
      .flatMap((entry) => {
        const id = recordObject(entry.identity).id;
        return typeof id === "string" ? [id] : [];
      }),
  );
  const plots = new Map(
    campaignRecords
      .filter((record) => record.resourceType === "plots")
      .map((record) => [record.sourceId, recordObject(record.payload)] as const),
  );
  const preparation = recordObject(state.preparation);
  for (const canvasValue of Array.isArray(preparation.locationCanvases)
    ? preparation.locationCanvases
    : []) {
    const canvas = recordObject(canvasValue);
    if (typeof canvas.locationId !== "string" || !locations.has(canvas.locationId)) {
      issues.push(missingReference("canvas-location-not-captured", "Location canvas", "A preparation canvas refers to a Location absent from the target World."));
    }
  }
  for (const progressValue of Array.isArray(state.plotProgress) ? state.plotProgress : []) {
    const progress = recordObject(progressValue);
    const plot = plots.get(String(progress.plotDefinitionId));
    if (!plot) continue;
    const claims = new Set(
      (Array.isArray(plot.discoveries) ? plot.discoveries : [])
        .map(recordObject)
        .flatMap((discovery) =>
          (Array.isArray(discovery.claims) ? discovery.claims : [])
            .map(recordObject)
            .flatMap((claim) => (typeof claim.id === "string" ? [claim.id] : [])),
        ),
    );
    for (const claimId of Array.isArray(progress.revealedClaimIds)
      ? progress.revealedClaimIds
      : []) {
      if (typeof claimId === "string" && !claims.has(claimId)) {
        issues.push(missingReference("revealed-claim-not-captured", "Plot discovery", "A revealed claim is absent from the target Plot."));
      }
    }
    for (const knowledgeValue of Array.isArray(progress.creatureKnowledge)
      ? progress.creatureKnowledge
      : []) {
      const knowledge = recordObject(knowledgeValue);
      if (typeof knowledge.claimId === "string" && !claims.has(knowledge.claimId)) {
        issues.push(missingReference("knowledge-claim-not-captured", "Creature knowledge", "Creature knowledge refers to a claim absent from the target Plot."));
      }
      if (typeof knowledge.creatureId === "string" && !entityIds.has(knowledge.creatureId)) {
        issues.push(missingReference("knowledge-creature-not-found", "Creature knowledge", "Creature knowledge refers to a missing Instance Creature."));
      }
    }
    const contexts = new Map(
      (Array.isArray(plot.locationContexts) ? plot.locationContexts : [])
        .map(recordObject)
        .flatMap((context) => typeof context.id === "string"
          ? [[context.id, context] as const]
          : []),
    );
    for (const locationValue of Array.isArray(progress.locationRealizations)
      ? progress.locationRealizations
      : []) {
      const location = recordObject(locationValue);
      if (
        typeof location.plotLocationContextId === "string" &&
        !contexts.has(location.plotLocationContextId)
      ) {
        issues.push(missingReference("plot-location-context-not-captured", "Plot Location", "A Plot Location realization is absent from the target Plot."));
      }
      const context = typeof location.plotLocationContextId === "string"
        ? contexts.get(location.plotLocationContextId)
        : undefined;
      const actorIntentIds = new Set(
        (Array.isArray(context?.actorPlacements) ? context.actorPlacements : [])
          .map(recordObject)
          .flatMap((intent) => typeof intent.id === "string" ? [intent.id] : []),
      );
      const itemIntentIds = new Set(
        (Array.isArray(context?.itemPlacements) ? context.itemPlacements : [])
          .map(recordObject)
          .flatMap((intent) => typeof intent.id === "string" ? [intent.id] : []),
      );
      for (const actorValue of Array.isArray(location.actors) ? location.actors : []) {
        const actor = recordObject(actorValue);
        if (typeof actor.actorPlacementIntentId !== "string" || !actorIntentIds.has(actor.actorPlacementIntentId)) {
          issues.push(missingReference("plot-actor-intent-not-captured", "Plot actor", "A Plot actor realization refers to an actor intent absent from the target Plot Location."));
        }
        if (typeof actor.runtimeActorId === "string" && !entityIds.has(actor.runtimeActorId)) {
          issues.push(missingReference("plot-actor-not-found", "Plot actor", "A Plot actor realization refers to a missing Instance Creature."));
        }
        if (typeof actor.runtimePlacementId === "string" && !realizationIds.has(actor.runtimePlacementId)) {
          issues.push(missingReference("plot-placement-not-found", "Plot placement", "A Plot actor realization refers to a missing Instance placement."));
        }
      }
      for (const itemValue of Array.isArray(location.items) ? location.items : []) {
        const item = recordObject(itemValue);
        if (typeof item.itemPlacementIntentId !== "string" || !itemIntentIds.has(item.itemPlacementIntentId)) {
          issues.push(missingReference("plot-item-intent-not-captured", "Plot item", "A Plot Item realization refers to an Item intent absent from the target Plot Location."));
        }
        if (typeof item.runtimeItemId === "string" && !itemIds.has(item.runtimeItemId)) {
          issues.push(missingReference("plot-item-not-found", "Plot item", "A Plot item realization refers to a missing Instance Item."));
        }
      }
    }
  }
  for (const item of itemInstances) {
    if (typeof item.definitionId === "string" && !definitions.has(item.definitionId)) {
      issues.push(missingReference("item-definition-not-captured", "Instance Item", "An Instance Item definition is absent from the target World."));
    }
    const location = recordObject(item.location);
    if (location.kind === "location" && typeof location.locationId === "string" && !locations.has(location.locationId)) {
      issues.push(missingReference("item-location-not-captured", "Instance Item", "An Instance Item Location is absent from the target World."));
    }
    if (location.kind === "container" && typeof location.containerId === "string" && !itemIds.has(location.containerId)) {
      issues.push(missingReference("item-container-not-found", "Instance Item", "An Instance Item container is missing."));
    }
    if ((location.kind === "inventory" || location.kind === "carried") && typeof (location.ownerId ?? location.carrierId) === "string" && !entityIds.has(String(location.ownerId ?? location.carrierId))) {
      issues.push(missingReference("item-owner-not-found", "Instance Item", "An Instance Item owner is missing."));
    }
  }
  for (const embodiment of embodiments) {
    const source = recordObject(embodiment.source);
    const creature = recordObject(embodiment.creature);
    if (
      typeof creature.definitionId === "string" &&
      !definitionHasKind(closure, creature.definitionId, "creature")
    ) {
      issues.push(missingReference("creature-definition-not-captured", "Creature embodiment", "A Creature overlay refers to a non-Creature or absent target Definition."));
    }
    if (
      typeof creature.currentLocationId === "string" &&
      !locations.has(creature.currentLocationId)
    ) {
      issues.push(missingReference("creature-location-not-captured", "Creature embodiment", "A Creature overlay refers to a Location absent from the target World."));
    }
    if (
      (source.kind === "captured-world-creature" || source.kind === "campaign-placement") &&
      typeof source.sourceCreatureId === "string" &&
      !definitionHasKind(closure, source.sourceCreatureId, "creature")
    ) {
      issues.push(missingReference("creature-source-kind-invalid", "Creature embodiment", "A Creature source does not resolve to a captured Creature Definition."));
    }
    if (
      source.kind === "character" &&
      (typeof source.characterId !== "string" || !runtimeCharacterIds.has(source.characterId))
    ) {
      issues.push(missingReference("character-source-not-found", "Creature embodiment", "A Character embodiment source is not associated with this Campaign Instance."));
    }
  }
  for (const item of itemInstances) {
    if (
      typeof item.definitionId === "string" &&
      !definitionHasKind(closure, item.definitionId, "item")
    ) {
      issues.push(missingReference("item-definition-kind-invalid", "Instance Item", "An Instance Item does not resolve to a captured Item Definition."));
    }
  }
  walkReferenceContainers(state, (key, value) => {
    if (
      key === "modelSchemaReleaseIds" &&
      Array.isArray(value) &&
      value.some((id) => typeof id !== "string" || !modelSchemaReleases.has(id))
    ) {
      issues.push(missingReference("model-release-not-captured", "Model conformance", "A Model Schema release is absent from the target captured pair."));
    }
    if ((key === "conceptId" || key === "fieldId") && typeof value === "string" && !modelElements.has(value)) {
      issues.push(missingReference("model-element-not-captured", "Model conformance", "A Model element is absent from the target captured pair."));
    }
  });
  validateGovernedRuntime(
    state,
    closure,
    definitions,
    entityIds,
    modelSchemaReleases,
    modelElements,
    issues,
  );
  return issues;
}

function definitionHasKind(
  closure: CapturedClosure | undefined,
  id: string,
  expectedKind: "creature" | "item",
) {
  const record = closure?.records.find(
    (candidate) => candidate.resourceType === "definitions" && candidate.sourceId === id,
  );
  return recordObject(record?.payload).kind === expectedKind;
}

function validateGovernedRuntime(
  value: unknown,
  closure: CapturedClosure | undefined,
  definitions: ReadonlySet<string>,
  entityIds: ReadonlySet<string>,
  modelSchemaReleases: ReadonlySet<string>,
  modelElements: ReadonlySet<string>,
  issues: Array<{ code: string; subject: string; detail: string }>,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => validateGovernedRuntime(entry, closure, definitions, entityIds, modelSchemaReleases, modelElements, issues));
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  const conformance = recordObject(object.conformance);
  const modelValues = recordObject(object.modelValues);
  if (Object.keys(conformance).length > 0 || Object.keys(modelValues).length > 0) {
    const releases = conformance.modelSchemaReleaseIds;
    const exactReleaseIds = closure?.modelSchemaReleaseIds ?? [];
    if (
      !Array.isArray(releases) ||
      releases.length !== exactReleaseIds.length ||
      releases.some((id, index) => typeof id !== "string" || id !== exactReleaseIds[index] || !modelSchemaReleases.has(id)) ||
      typeof conformance.conceptId !== "string" ||
      !modelElements.has(conformance.conceptId) ||
      closure?.modelElementsById.get(conformance.conceptId)?.kind !== "concept"
    ) {
      issues.push(missingReference("model-conformance-invalid", "Model conformance", "Runtime Model conformance does not resolve through the exact target captured schema."));
    }
    for (const [storageKey, fieldValue] of Object.entries(modelValues)) {
      const field = closure?.modelFieldsByStorageKey.get(storageKey);
      if (!field) {
        issues.push(missingReference("model-field-not-captured", "Model values", "A runtime Model value uses a field absent from the target effective schema."));
        continue;
      }
      const allowedConceptIds = typeof conformance.conceptId === "string"
        ? modelConceptAncestry(conformance.conceptId, closure)
        : new Set<string>();
      if (typeof field.ownerConceptId !== "string" || !allowedConceptIds.has(field.ownerConceptId)) {
        issues.push(missingReference("model-field-concept-invalid", "Model values", "A runtime Model field does not belong to the selected target concept or its ancestry."));
        continue;
      }
      validateModelReferenceValue(
        fieldValue,
        recordObject(field.valueType),
        definitions,
        entityIds,
        modelElements,
        issues,
      );
    }
  }
  const extensions = recordObject(object.extensions);
  for (const [key, extensionValue] of Object.entries(extensions)) {
    const schema = closure?.extensionSchemas.get(key);
    if (schema) validateSchemaReferences(extensionValue, schema, closure, issues);
  }
  for (const child of Object.values(object)) {
    validateGovernedRuntime(child, closure, definitions, entityIds, modelSchemaReleases, modelElements, issues);
  }
}

function validateModelReferenceValue(
  value: unknown,
  valueType: Record<string, unknown>,
  definitions: ReadonlySet<string>,
  entityIds: ReadonlySet<string>,
  modelElements: ReadonlySet<string>,
  issues: Array<{ code: string; subject: string; detail: string }>,
): void {
  if (valueType.kind === "list") {
    if (!Array.isArray(value)) {
      issues.push(missingReference("model-value-type-invalid", "Model values", "A runtime Model list value has the wrong shape."));
      return;
    }
    const itemType = recordObject(valueType.item);
    value.forEach((entry) => validateModelReferenceValue(entry, itemType, definitions, entityIds, modelElements, issues));
    return;
  }
  const target = valueType.kind === "definition-reference"
    ? definitions
    : valueType.kind === "entity-reference"
      ? entityIds
      : valueType.kind === "vocabulary-option-reference"
        ? modelElements
        : undefined;
  if (target && (typeof value !== "string" || !target.has(value))) {
    issues.push(missingReference("model-value-reference-invalid", "Model values", "A schema-declared runtime reference is absent from the target captured/runtime closure."));
  }
  if (!target && !matchesModelValueType(value, valueType)) {
    issues.push(missingReference("model-value-type-invalid", "Model values", "A runtime Model value has the wrong type for the target effective schema."));
  }
}

function modelConceptAncestry(
  conceptId: string,
  closure: CapturedClosure | undefined,
) {
  const result = new Set<string>();
  let current: string | undefined = conceptId;
  while (current && !result.has(current)) {
    result.add(current);
    const concept: Record<string, unknown> | undefined = closure?.modelElementsById.get(current);
    current = typeof concept?.parentConceptId === "string"
      ? concept.parentConceptId
      : undefined;
  }
  return result;
}

function matchesModelValueType(value: unknown, valueType: Record<string, unknown>): boolean {
  if (valueType.kind === "list") {
    const item = recordObject(valueType.item);
    return Array.isArray(value) && Object.keys(item).length > 0 &&
      value.every((entry) => matchesModelValueType(entry, item));
  }
  if (valueType.kind === "string") return typeof value === "string";
  if (valueType.kind === "integer") return typeof value === "number" && Number.isInteger(value);
  if (valueType.kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (valueType.kind === "boolean") return typeof value === "boolean";
  if (valueType.kind === "json") return value === null || ["string", "number", "boolean", "object"].includes(typeof value);
  return valueType.kind === "concept-value" ? value !== undefined : true;
}

function validateSchemaReferences(
  value: unknown,
  schema: Record<string, unknown>,
  closure: CapturedClosure | undefined,
  issues: Array<{ code: string; subject: string; detail: string }>,
): void {
  const resourceType = schema["x-aow-reference-resource"];
  if (typeof resourceType === "string") {
    const valid = typeof value === "string" && closure?.records.some(
      (record) => record.resourceType === resourceType && record.sourceId === value,
    );
    if (!valid) {
      issues.push(missingReference("extension-reference-not-captured", "Extension data", "A schema-declared extension reference is absent from the target captured pair."));
    }
    return;
  }
  if (Array.isArray(value)) {
    const items = recordObject(schema.items);
    if (Object.keys(items).length > 0)
      value.forEach((entry) => validateSchemaReferences(entry, items, closure, issues));
    return;
  }
  if (!value || typeof value !== "object") return;
  const properties = recordObject(schema.properties);
  for (const [key, child] of Object.entries(value)) {
    const childSchema = recordObject(properties[key]);
    if (Object.keys(childSchema).length > 0)
      validateSchemaReferences(child, childSchema, closure, issues);
  }
}

function missingReference(code: string, subject: string, detail: string) {
  return { code, subject, detail };
}

function walkReferenceContainers(
  value: unknown,
  visit: (key: string, value: unknown) => void,
) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkReferenceContainers(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walkReferenceContainers(child, visit);
  }
}

function recordObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function humanName(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const object = payload as Record<string, unknown>;
    const identity = recordObject(object.identity);
    const name = object.name ?? identity.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return fallback.replaceAll("-", " ");
}

function revisionLink(
  revision: {
    name: string;
    revisionNumber: number;
    campaignDefinitionId?: string;
    worldDefinitionId?: string;
  },
  kind: "campaign" | "world",
) {
  return {
    name: revision.name,
    revisionNumber: revision.revisionNumber,
    authoringHref:
      kind === "campaign"
        ? `/campaigns/definitions/${revision.campaignDefinitionId}`
        : `/worlds/${revision.worldDefinitionId}`,
  };
}

function compareChange(left: { typeLabel: string; subjectName: string }, right: { typeLabel: string; subjectName: string }) {
  return left.typeLabel.localeCompare(right.typeLabel) || left.subjectName.localeCompare(right.subjectName);
}

function pageMappingCandidates(
  conflicts: readonly {
    readonly key: string;
    readonly resourceType: string;
    readonly sourceId?: string;
    readonly mappingRequired: boolean;
  }[],
  sourceRecords: readonly MigrationRecord[],
  targetRecords: readonly MigrationRecord[],
  claimedTargetKeys: ReadonlySet<string>,
  submittedMappings: ReadonlyMap<string, string>,
  offset: number,
  limit: number,
) {
  const targetsByScope = new Map<string, Array<{
    readonly resourceType: string;
    readonly sourceId: string;
    readonly targetName: string;
  }>>();
  for (const record of targetRecords) {
    if (claimedTargetKeys.has(`${record.resourceType}:${record.sourceId}`)) continue;
    const groupKey = migrationScopeKey(record.resourceType, record.nested?.scope);
    const targets = targetsByScope.get(groupKey) ?? [];
    targets.push({
      resourceType: record.resourceType,
      sourceId: record.sourceId,
      targetName: humanName(record.payload, record.resourceType),
    });
    targetsByScope.set(groupKey, targets);
  }
  for (const targets of targetsByScope.values()) {
    targets.sort(
      (left, right) =>
        left.targetName.localeCompare(right.targetName) ||
        left.sourceId.localeCompare(right.sourceId),
    );
  }

  const items: Array<{
    readonly conflictKey: string;
    readonly resourceType: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly targetName: string;
    readonly targetTypeLabel: string;
  }> = [];
  const sourceByKey = new Map(
    sourceRecords.map((record) => [
      `${record.resourceType}:${record.sourceId}`,
      record,
    ]),
  );
  let total = 0;
  for (const conflict of conflicts) {
    if (!conflict.mappingRequired || !conflict.sourceId) continue;
    const source = sourceByKey.get(
      `${conflict.resourceType}:${conflict.sourceId}`,
    );
    const expectedScope = source?.nested
      ? mappedNestedScope(source, submittedMappings, targetRecords)
      : undefined;
    const targets = source
      ? targetsByScope.get(migrationScopeKey(conflict.resourceType, expectedScope)) ?? []
      : [];
    const blockStart = total;
    total += targets.length;
    if (items.length >= limit || total <= offset || blockStart >= offset + limit)
      continue;
    const start = Math.max(0, offset - blockStart);
    const end = Math.min(targets.length, offset + limit - blockStart);
    for (const target of targets.slice(start, end)) {
      if (items.length < limit) {
        items.push({
          conflictKey: conflict.key,
          resourceType: conflict.resourceType,
          sourceId: conflict.sourceId,
          targetId: target.sourceId,
          targetName: target.targetName,
          targetTypeLabel: target.resourceType,
        });
      }
    }
  }
  return { items, total };
}

function contentRecords<
  RecordValue extends { resourceType: string; sourceId: string },
>(records: readonly RecordValue[]): RecordValue[] {
  return records.filter(
    ({ resourceType }) =>
      resourceType !== "campaign-definition-revision" &&
      resourceType !== "world-definition-revision" &&
      resourceType !== "campaign-definition-snapshot" &&
      resourceType !== "world-definition-snapshot",
  );
}

interface MigrationRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly payload: unknown;
  readonly contentHash: string;
  readonly nested?: {
    readonly scope: readonly string[];
    readonly localId: string;
  };
}

function runtimeMigrationRecords(baseRecords: readonly MigrationRecord[]) {
  const records = [...baseRecords];
  for (const plotRecord of baseRecords) {
    if (plotRecord.resourceType !== "plots") continue;
    const plot = recordObject(plotRecord.payload);
    for (const objectiveValue of Array.isArray(plot.objectives) ? plot.objectives : []) {
      const objective = recordObject(objectiveValue);
      if (typeof objective.id !== "string") continue;
      records.push(nestedMigrationRecord(
        "plot-objectives",
        [plotRecord.sourceId],
        objective.id,
        objective,
        humanName(objective, "Plot objective"),
      ));
    }
    for (const discoveryValue of Array.isArray(plot.discoveries) ? plot.discoveries : []) {
      const discovery = recordObject(discoveryValue);
      for (const claimValue of Array.isArray(discovery.claims) ? discovery.claims : []) {
        const claim = recordObject(claimValue);
        if (typeof claim.id !== "string") continue;
        records.push(nestedMigrationRecord(
          "plot-claims",
          [plotRecord.sourceId],
          claim.id,
          claim,
          typeof claim.statement === "string" && claim.statement.trim()
            ? claim.statement.trim()
            : "Plot claim",
        ));
      }
    }
    for (const contextValue of Array.isArray(plot.locationContexts) ? plot.locationContexts : []) {
      const context = recordObject(contextValue);
      if (typeof context.id !== "string") continue;
      records.push(nestedMigrationRecord(
        "plot-location-contexts",
        [plotRecord.sourceId],
        context.id,
        context,
        "Plot Location context",
      ));
      for (const actorValue of Array.isArray(context.actorPlacements) ? context.actorPlacements : []) {
        const actor = recordObject(actorValue);
        if (typeof actor.id !== "string") continue;
        records.push(nestedMigrationRecord(
          "plot-actor-intents",
          [plotRecord.sourceId, context.id],
          actor.id,
          actor,
          typeof actor.role === "string" && actor.role.trim()
            ? actor.role.trim()
            : "Plot actor intent",
        ));
      }
      for (const itemValue of Array.isArray(context.itemPlacements) ? context.itemPlacements : []) {
        const item = recordObject(itemValue);
        if (typeof item.id !== "string") continue;
        records.push(nestedMigrationRecord(
          "plot-item-intents",
          [plotRecord.sourceId, context.id],
          item.id,
          item,
          typeof item.description === "string" && item.description.trim()
            ? item.description.trim()
            : "Plot Item intent",
        ));
      }
    }
  }
  return records;
}

function nestedMigrationRecord(
  resourceType: string,
  scope: readonly string[],
  localId: string,
  sourcePayload: Record<string, unknown>,
  name: string,
) {
  const payload = { name, sourcePayload };
  return {
    resourceType,
    sourceId: scopedMigrationReference(scope, localId),
    payload,
    contentHash: canonicalJsonHash(payload),
    nested: { scope, localId },
  };
}

function validateMappings(
  mappings: readonly { resourceType: string; sourceId: string; targetId: string }[],
  sourceRecords: readonly MigrationRecord[],
  targetRecords: readonly MigrationRecord[],
) {
  const targetByKey = new Map(
    targetRecords.map((record) => [
      `${record.resourceType}:${record.sourceId}`,
      record,
    ]),
  );
  const sourceRecordsByKey = new Map(
    sourceRecords.map((record) => [
      `${record.resourceType}:${record.sourceId}`,
      record,
    ]),
  );
  const submittedMappings = new Map(
    mappings.map((mapping) => [
      `${mapping.resourceType}:${mapping.sourceId}`,
      mapping.targetId,
    ]),
  );
  const rewriteMappings = new Map<string, string>();
  const mappedSources = new Set<string>();
  const mappedTargets = new Set<string>();
  for (const mapping of mappings) {
    const sourceKey = `${mapping.resourceType}:${mapping.sourceId}`;
    const targetKey = `${mapping.resourceType}:${mapping.targetId}`;
    if (
      !sourceRecordsByKey.has(sourceKey) ||
      !targetByKey.has(targetKey) ||
      mappedSources.has(sourceKey) ||
      mappedTargets.has(targetKey)
    ) {
      throw new BadRequestException(
        "Migration mappings must uniquely connect existing records of the same type.",
      );
    }
    const source = sourceRecordsByKey.get(sourceKey);
    const target = targetByKey.get(targetKey);
    if (
      !source ||
      !target ||
      !scopesMatch(source, target, submittedMappings, targetRecords)
    ) {
      throw new BadRequestException(
        "Nested migration mappings must remain within the mapped parent Plot and Location context.",
      );
    }
    mappedSources.add(sourceKey);
    mappedTargets.add(targetKey);
    rewriteMappings.set(sourceKey, target.nested?.localId ?? target.sourceId);
  }
  return rewriteMappings;
}

function scopesMatch(
  source: MigrationRecord,
  target: MigrationRecord,
  mappings: ReadonlyMap<string, string>,
  targetRecords: readonly MigrationRecord[],
): boolean {
  if (!source.nested || !target.nested) return !source.nested && !target.nested;
  const expected = mappedNestedScope(source, mappings, targetRecords);
  return (
    expected.length === target.nested.scope.length &&
    expected.every((part, index) => target.nested?.scope[index] === part)
  );
}

function mappedNestedScope(
  source: MigrationRecord,
  mappings: ReadonlyMap<string, string>,
  targetRecords: readonly MigrationRecord[],
): string[] {
  if (!source.nested) return [];
  const expected = [...source.nested.scope];
  expected[0] = mappings.get(`plots:${expected[0]}`) ?? expected[0];
  if (expected.length === 2) {
    const contextSourceId = scopedMigrationReference(
      [source.nested.scope[0] ?? ""],
      source.nested.scope[1] ?? "",
    );
    const contextTargetId = mappings.get(
      `plot-location-contexts:${contextSourceId}`,
    );
    if (contextTargetId) {
      const contextTarget = targetRecords.find(
        (record) =>
          record.resourceType === "plot-location-contexts" &&
          record.sourceId === contextTargetId,
      );
      if (contextTarget?.nested) expected[1] = contextTarget.nested.localId;
    }
  }
  return expected;
}

function migrationScopeKey(
  resourceType: string,
  scope: readonly string[] | undefined,
): string {
  return scope
    ? `${resourceType}:nested:${canonicalJsonHash(scope)}`
    : `${resourceType}:top-level`;
}

function assertExpandedMigrationBound(
  records: readonly MigrationRecord[],
  label: string,
) {
  if (records.length > MAX_MIGRATION_EXPANDED_RECORDS) {
    throw new ConflictException(
      `The ${label} captured definition expands beyond the supported migration record limit.`,
    );
  }
}

async function capturedCharacterIds(
  client: Client,
  campaignInstanceId: string,
): Promise<ReadonlySet<string>> {
  const result = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await client.campaignInstanceCharacterAssociation.findMany({
      where: { campaignInstanceId },
      select: { characterId: true },
      orderBy: { characterId: "asc" },
      take: 500,
      ...(cursor ? { cursor: { characterId: cursor }, skip: 1 } : {}),
    });
    page.forEach(({ characterId }) => result.add(characterId));
    if (page.length < 500) return result;
    cursor = page.at(-1)?.characterId;
    if (!cursor) return result;
  }
}

function notFound() {
  return new NotFoundException("The selected Campaign Instance was not found.");
}

function stale() {
  return new ConflictException("Campaign Instance state changed; preview the migration again.");
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
