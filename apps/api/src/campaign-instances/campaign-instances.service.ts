import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
  isCanonicalSnapshotManifest,
} from "../domain/snapshot-manifest";
import { resolveCreatureInstanceEmbodimentPolicy } from "@aow/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCampaignInstanceDto } from "./dto/create-campaign-instance.dto";

interface CapturedRevisionSummaryRow {
  readonly revisionNumber: number;
  readonly name: string;
  readonly campaignDefinitionId?: string;
  readonly worldDefinitionId?: string;
}

interface CampaignInstanceListRow {
  readonly id: string;
  readonly campaignDefinitionId: string;
  readonly name: string;
  readonly status: string;
  readonly metadataRevision: number;
  readonly updatedAt: Date;
  readonly currentSnapshot: {
    readonly id: string;
    readonly snapshotNumber: number;
    readonly reason: string;
    readonly adoptedAt: Date;
    readonly campaignDefinitionSnapshot: {
      readonly campaignDefinitionRevision: CapturedRevisionSummaryRow;
    };
    readonly worldDefinitionSnapshot: {
      readonly worldDefinitionRevision: CapturedRevisionSummaryRow;
    };
  } | null;
}

interface CapturedRevisionDetailRow extends CapturedRevisionSummaryRow {
  readonly id: string;
  readonly contentHash: string;
  readonly publishedAt: Date;
}

interface CapturedDefinitionDetailRow {
  readonly id: string;
  readonly contentHash: string;
  readonly capturedAt: Date;
}

interface CampaignInstanceDetailRow {
  readonly id: string;
  readonly campaignDefinitionId: string;
  readonly name: string;
  readonly status: string;
  readonly metadataRevision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly concludedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly currentSnapshot: {
    readonly id: string;
    readonly snapshotNumber: number;
    readonly predecessorSnapshotId: string | null;
    readonly reason: string;
    readonly contentHash: string;
    readonly adoptedAt: Date;
    readonly campaignDefinitionSnapshot: CapturedDefinitionDetailRow & {
      readonly campaignDefinitionRevision: CapturedRevisionDetailRow;
    };
    readonly worldDefinitionSnapshot: CapturedDefinitionDetailRow & {
      readonly worldDefinitionRevision: CapturedRevisionDetailRow;
    };
  } | null;
  readonly runtime: {
    readonly id: string;
    readonly campaignInstanceSnapshotId: string;
    readonly revision: number;
    readonly updatedAt: Date;
  } | null;
}

/** Narrow read capability used by this aggregate-specific API. */
export interface CampaignInstanceReader {
  readonly campaignInstance: {
    findMany(args: unknown): Promise<readonly CampaignInstanceListRow[]>;
    count?(args: unknown): Promise<number>;
    findUnique(args: unknown): Promise<CampaignInstanceDetailRow | null>;
    findFirst?(args: unknown): Promise<{
      id: string;
      name: string;
      campaignDefinitionId: string;
      currentSnapshot: { campaignDefinitionSnapshotId: string } | null;
    } | null>;
  };
}

interface SelectedCampaignDefinitionSnapshotRow {
  readonly id: string;
  readonly campaignDefinitionId: string;
  readonly campaignDefinitionRevisionId: string;
  readonly capturedWorldSnapshotId: string;
  readonly manifest: unknown;
  readonly contentHash: string;
  readonly capturedAt: Date;
  readonly campaignDefinitionRevision: {
    readonly id: string;
    readonly campaignDefinitionId: string;
    readonly capturedWorldSnapshotId: string;
    readonly revisionNumber: number;
    readonly name: string;
    readonly contentHash: string;
    readonly content: unknown;
    readonly publishedAt: Date;
  };
  readonly capturedWorldSnapshot: {
    readonly id: string;
    readonly worldDefinitionId: string;
    readonly worldDefinitionRevisionId: string;
    readonly manifest: unknown;
    readonly contentHash: string;
    readonly capturedAt: Date;
    readonly worldDefinitionRevision: CapturedRevisionDetailRow;
  };
}

interface CampaignInstanceCreateTransaction {
  readonly campaignDefinitionSnapshot: {
    findUnique(
      args: unknown,
    ): Promise<SelectedCampaignDefinitionSnapshotRow | null>;
  };
  readonly campaignInstance: {
    create(args: unknown): Promise<{
      readonly id: string;
      readonly name: string;
      readonly status: string;
      readonly createdAt: Date;
      readonly updatedAt: Date;
      readonly metadataRevision: number;
    }>;
    findFirst?(args: unknown): Promise<{
      readonly id: string;
      readonly name: string;
      readonly campaignDefinitionId: string;
      readonly currentSnapshot: {
        readonly campaignDefinitionSnapshotId: string;
      } | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
  readonly campaignInstanceSnapshot: {
    create(args: unknown): Promise<{
      readonly id: string;
      readonly snapshotNumber: number;
      readonly reason: string;
      readonly contentHash: string;
      readonly adoptedAt: Date;
    }>;
  };
  readonly campaignInstanceRuntime: {
    create(args: unknown): Promise<{
      readonly id: string;
      readonly revision: number;
      readonly updatedAt: Date;
    }>;
  };
  readonly campaignInstanceHumanMembership: {
    create(args: unknown): Promise<unknown>;
  };
  readonly campaignInstanceRuntimeCheckpoint?: {
    create(args: unknown): Promise<unknown>;
  };
  readonly campaignInstanceAuditEvent?: {
    create(args: unknown): Promise<unknown>;
  };
}

export interface CampaignInstanceStore extends CampaignInstanceReader {
  readonly $transaction?: (
    operation: (tx: CampaignInstanceCreateTransaction) => Promise<unknown>,
    options: { readonly isolationLevel: unknown },
  ) => Promise<unknown>;
}

const campaignRevisionSummarySelect = {
  revisionNumber: true,
  name: true,
  campaignDefinitionId: true,
} as const;

const worldRevisionSummarySelect = {
  revisionNumber: true,
  name: true,
  worldDefinitionId: true,
} as const;

const listSelect = {
  id: true,
  campaignDefinitionId: true,
  name: true,
  status: true,
  metadataRevision: true,
  updatedAt: true,
  currentSnapshot: {
    select: {
      id: true,
      snapshotNumber: true,
      reason: true,
      adoptedAt: true,
      campaignDefinitionSnapshot: {
        select: {
          campaignDefinitionRevision: { select: campaignRevisionSummarySelect },
        },
      },
      worldDefinitionSnapshot: {
        select: {
          worldDefinitionRevision: { select: worldRevisionSummarySelect },
        },
      },
    },
  },
} as const;

const campaignRevisionDetailSelect = {
  id: true,
  revisionNumber: true,
  name: true,
  campaignDefinitionId: true,
  contentHash: true,
  publishedAt: true,
} as const;

const worldRevisionDetailSelect = {
  id: true,
  revisionNumber: true,
  name: true,
  worldDefinitionId: true,
  contentHash: true,
  publishedAt: true,
} as const;

const detailSelect = {
  id: true,
  campaignDefinitionId: true,
  name: true,
  status: true,
  metadataRevision: true,
  createdAt: true,
  updatedAt: true,
  concludedAt: true,
  archivedAt: true,
  currentSnapshot: {
    select: {
      id: true,
      snapshotNumber: true,
      predecessorSnapshotId: true,
      reason: true,
      contentHash: true,
      content: true,
      adoptedAt: true,
      campaignDefinitionSnapshot: {
        select: {
          id: true,
          contentHash: true,
          capturedAt: true,
          campaignDefinitionRevision: { select: campaignRevisionDetailSelect },
        },
      },
      worldDefinitionSnapshot: {
        select: {
          id: true,
          contentHash: true,
          capturedAt: true,
          worldDefinitionRevision: { select: worldRevisionDetailSelect },
        },
      },
    },
  },
  runtime: {
    select: {
      id: true,
      campaignInstanceSnapshotId: true,
      revision: true,
      updatedAt: true,
    },
  },
} as const;

const selectedSnapshotSelect = {
  id: true,
  campaignDefinitionId: true,
  campaignDefinitionRevisionId: true,
  capturedWorldSnapshotId: true,
  manifest: true,
  contentHash: true,
  capturedAt: true,
  campaignDefinitionRevision: {
    select: {
      id: true,
      campaignDefinitionId: true,
      capturedWorldSnapshotId: true,
      revisionNumber: true,
      name: true,
      contentHash: true,
      content: true,
      publishedAt: true,
    },
  },
  capturedWorldSnapshot: {
    select: {
      id: true,
      worldDefinitionId: true,
      worldDefinitionRevisionId: true,
      manifest: true,
      contentHash: true,
      capturedAt: true,
      worldDefinitionRevision: { select: worldRevisionDetailSelect },
    },
  },
} as const;

@Injectable()
export class CampaignInstancesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: CampaignInstanceStore,
  ) {}

  async list(
    createdByUserId: string,
    campaignDefinitionId?: string,
    limit = 200,
    offset = 0,
  ) {
    let rows: readonly CampaignInstanceListRow[];
    let total: number;
    const where = {
      ownerUserId: createdByUserId,
      ...(campaignDefinitionId ? { campaignDefinitionId } : {}),
    };
    try {
      rows = await this.prisma.campaignInstance.findMany({
        where,
        select: listSelect,
        orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      });
      total = this.prisma.campaignInstance.count
        ? await this.prisma.campaignInstance.count({ where })
        : rows.length;
    } catch {
      this.unavailable();
    }

    return {
      items: rows.map((row) => ({
        id: row.id,
        campaignDefinitionId: row.campaignDefinitionId,
        name: row.name,
        status: row.status.toLowerCase(),
        metadataRevision: row.metadataRevision,
        updatedAt: row.updatedAt.toISOString(),
        currentSnapshot: row.currentSnapshot
          ? {
              snapshotId: row.currentSnapshot.id,
              snapshotNumber: row.currentSnapshot.snapshotNumber,
              reason: row.currentSnapshot.reason.toLowerCase(),
              adoptedAt: row.currentSnapshot.adoptedAt.toISOString(),
              campaignDefinition: revisionSummary(
                row.currentSnapshot.campaignDefinitionSnapshot
                  .campaignDefinitionRevision,
                "campaign",
              ),
              worldDefinition: revisionSummary(
                row.currentSnapshot.worldDefinitionSnapshot
                  .worldDefinitionRevision,
                "world",
              ),
            }
          : undefined,
      })),
      total,
      limit,
      offset,
    };
  }

  async get(
    id: string,
    createdByUserId: string,
    campaignDefinitionId?: string,
  ) {
    let row: CampaignInstanceDetailRow | null;
    try {
      row = await this.prisma.campaignInstance.findUnique({
        where: {
          id,
          ownerUserId: createdByUserId,
          ...(campaignDefinitionId ? { campaignDefinitionId } : {}),
        },
        select: detailSelect,
      });
    } catch {
      this.unavailable();
    }

    if (!row) {
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    }

    return {
      id: row.id,
      campaignDefinitionId: row.campaignDefinitionId,
      name: row.name,
      status: row.status.toLowerCase(),
      metadataRevision: row.metadataRevision,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      concludedAt: iso(row.concludedAt),
      archivedAt: iso(row.archivedAt),
      currentSnapshot: row.currentSnapshot
        ? {
            snapshotId: row.currentSnapshot.id,
            snapshotNumber: row.currentSnapshot.snapshotNumber,
            reason: row.currentSnapshot.reason.toLowerCase(),
            adoptedAt: row.currentSnapshot.adoptedAt.toISOString(),
            campaignDefinition: revisionSummary(
              row.currentSnapshot.campaignDefinitionSnapshot
                .campaignDefinitionRevision,
              "campaign",
            ),
            worldDefinition: revisionSummary(
              row.currentSnapshot.worldDefinitionSnapshot
                .worldDefinitionRevision,
              "world",
            ),
          }
        : undefined,
      runtime: row.runtime
        ? {
            revision: row.runtime.revision,
            updatedAt: row.runtime.updatedAt.toISOString(),
          }
        : undefined,
    };
  }

  async create(
    dto: CreateCampaignInstanceDto,
    createdByUserId: string,
    creatorDisplayName = "Game Master",
    campaignDefinitionId?: string,
  ) {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException("A Campaign Instance name is required.");
    }
    const selectedSnapshotId = dto.campaignDefinitionSnapshotId?.trim();
    if (!selectedSnapshotId) {
      throw new BadRequestException(
        "A Campaign Definition snapshot selection is required.",
      );
    }
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException("An idempotency key is required.");
    }
    const creationKeyHash = createHash("sha256")
      .update(createdByUserId)
      .update("\0")
      .update(idempotencyKey)
      .digest("hex");
    if (!this.prisma.$transaction) this.unavailable();

    try {
      const result = (await this.prisma.$transaction(
        async (tx) => {
          const prior = tx.campaignInstance.findFirst
            ? await tx.campaignInstance.findFirst({
                where: { ownerUserId: createdByUserId, creationKeyHash },
                select: {
                  id: true,
                  name: true,
                  campaignDefinitionId: true,
                  currentSnapshot: {
                    select: { campaignDefinitionSnapshotId: true },
                  },
                },
              })
            : null;
          if (prior) {
            if (
              prior.name !== name ||
              (campaignDefinitionId !== undefined &&
                prior.campaignDefinitionId !== campaignDefinitionId) ||
              prior.currentSnapshot?.campaignDefinitionSnapshotId !==
                selectedSnapshotId
            ) {
              throw new ConflictException(
                "This create request key was already used for different Campaign Instance details.",
              );
            }
            return { idempotentInstanceId: prior.id };
          }
          const selected = await tx.campaignDefinitionSnapshot.findUnique({
            where: {
              id: selectedSnapshotId,
              ...(campaignDefinitionId ? { campaignDefinitionId } : {}),
              campaignDefinition: { ownerUserId: createdByUserId },
            },
            select: selectedSnapshotSelect,
          });
          if (!selected) {
            throw new NotFoundException(
              "The selected Campaign Definition snapshot was not found.",
            );
          }
          assertConsistentSnapshot(selected);

          const instance = await tx.campaignInstance.create({
            data: {
              campaignDefinitionId: selected.campaignDefinitionId,
              name,
              status: "PREPARING",
              createdByUserId,
              ownerUserId: createdByUserId,
              creationKeyHash,
            },
            select: {
              id: true,
              name: true,
              status: true,
              metadataRevision: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          const manifest = replicatedCompatibilityManifest(selected);
          const snapshot = await tx.campaignInstanceSnapshot.create({
            data: {
              campaignInstanceId: instance.id,
              campaignDefinitionId: selected.campaignDefinitionId,
              campaignDefinitionSnapshotId: selected.id,
              worldDefinitionSnapshotId: selected.capturedWorldSnapshot.id,
              snapshotNumber: 1,
              reason: "INITIAL",
              manifest,
              contentHash: manifest.contentHash,
              createdByUserId,
            },
            select: {
              id: true,
              snapshotNumber: true,
              reason: true,
              contentHash: true,
              adoptedAt: true,
            },
          });
          const runtimeState = initialRuntimeState(selected, instance.id);
          const runtime = await tx.campaignInstanceRuntime.create({
            data: {
              campaignInstanceId: instance.id,
              campaignInstanceSnapshotId: snapshot.id,
              state: runtimeState,
              extensions: {},
            },
            select: { id: true, revision: true, updatedAt: true },
          });
          await tx.campaignInstanceHumanMembership.create({
            data: {
              campaignInstanceId: instance.id,
              userId: createdByUserId,
              displayName: creatorDisplayName.trim() || "Game Master",
              role: "GM",
              status: "ACTIVE",
            },
          });
          if (tx.campaignInstanceAuditEvent) {
            await tx.campaignInstanceAuditEvent.create({
              data: {
                campaignInstanceId: instance.id,
                actorUserId: createdByUserId,
                action: "instance.created",
                subjectName: instance.name,
                subjectType: "Campaign Instance",
                detail: {
                  campaignDefinitionName:
                    selected.campaignDefinitionRevision.name,
                  campaignDefinitionRevision:
                    selected.campaignDefinitionRevision.revisionNumber,
                  worldDefinitionName:
                    selected.capturedWorldSnapshot.worldDefinitionRevision.name,
                  worldDefinitionRevision:
                    selected.capturedWorldSnapshot.worldDefinitionRevision
                      .revisionNumber,
                },
              },
            });
          }
          if (tx.campaignInstanceRuntimeCheckpoint) {
            await tx.campaignInstanceRuntimeCheckpoint.create({
              data: {
                campaignInstanceId: instance.id,
                campaignInstanceSnapshotId: snapshot.id,
                checkpointNumber: 1,
                reason: "INITIAL",
                runtimeRevision: runtime.revision,
                state: runtimeState,
                extensions: {},
                contentHash: canonicalJsonHash(runtimeState),
                createdByUserId,
              },
            });
          }
          await tx.campaignInstance.update({
            where: { id: instance.id },
            data: { currentSnapshotId: snapshot.id },
          });

          return {
            id: instance.id,
            campaignDefinitionId: selected.campaignDefinitionId,
            name: instance.name,
            status: instance.status.toLowerCase(),
            metadataRevision: instance.metadataRevision,
            createdAt: instance.createdAt.toISOString(),
            updatedAt: instance.updatedAt.toISOString(),
            currentSnapshot: {
              snapshotId: snapshot.id,
              snapshotNumber: snapshot.snapshotNumber,
              reason: snapshot.reason.toLowerCase(),
              contentHash: snapshot.contentHash,
              adoptedAt: snapshot.adoptedAt.toISOString(),
              campaignDefinition: selectedDefinition(selected),
              worldDefinition: selectedWorld(selected.capturedWorldSnapshot),
            },
            runtime: {
              revision: runtime.revision,
              updatedAt: runtime.updatedAt.toISOString(),
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )) as Record<string, unknown>;
      if (typeof result.idempotentInstanceId === "string") {
        return this.get(
          result.idempotentInstanceId,
          createdByUserId,
          campaignDefinitionId,
        );
      }
      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (isPrismaCode(error, "P2034")) {
        throw new ConflictException(
          "Campaign Instance creation conflicted with another update; retry the same create request.",
        );
      }
      if (
        isPrismaCode(error, "P2002") &&
        this.prisma.campaignInstance.findFirst
      ) {
        const prior = await this.prisma.campaignInstance.findFirst({
          where: { ownerUserId: createdByUserId, creationKeyHash },
          select: {
            id: true,
            name: true,
            campaignDefinitionId: true,
            currentSnapshot: { select: { campaignDefinitionSnapshotId: true } },
          },
        });
        if (
          prior &&
          prior.name === name &&
          (campaignDefinitionId === undefined ||
            prior.campaignDefinitionId === campaignDefinitionId) &&
          prior.currentSnapshot?.campaignDefinitionSnapshotId ===
            selectedSnapshotId
        ) {
          return this.get(prior.id, createdByUserId);
        }
        if (prior) {
          throw new ConflictException(
            "This create request key was already used for different Campaign Instance details.",
          );
        }
      }
      this.unavailable();
    }
  }

  async assertParent(
    campaignDefinitionId: string,
    campaignInstanceId: string,
    ownerUserId: string,
  ) {
    let instance: {
      readonly id: string;
      readonly campaignDefinitionId: string;
    } | null;
    try {
      instance =
        (await this.prisma.campaignInstance.findFirst?.({
          where: {
            id: campaignInstanceId,
            campaignDefinitionId,
            ownerUserId,
          },
          select: { id: true, campaignDefinitionId: true },
        })) ?? null;
    } catch {
      this.unavailable();
    }
    if (!instance) {
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException(
      "Campaign Instances are temporarily unavailable.",
    );
  }
}

function assertConsistentSnapshot(
  selected: SelectedCampaignDefinitionSnapshotRow,
): void {
  if (
    selected.campaignDefinitionRevisionId !==
      selected.campaignDefinitionRevision.id ||
    selected.campaignDefinitionId !==
      selected.campaignDefinitionRevision.campaignDefinitionId ||
    selected.capturedWorldSnapshotId !== selected.capturedWorldSnapshot.id ||
    selected.capturedWorldSnapshotId !==
      selected.campaignDefinitionRevision.capturedWorldSnapshotId ||
    selected.capturedWorldSnapshot.worldDefinitionRevisionId !==
      selected.capturedWorldSnapshot.worldDefinitionRevision.id ||
    selected.contentHash !==
      (isCanonicalSnapshotManifest(selected.manifest)
        ? selected.manifest.contentHash
        : undefined) ||
    selected.capturedWorldSnapshot.contentHash !==
      (isCanonicalSnapshotManifest(selected.capturedWorldSnapshot.manifest)
        ? selected.capturedWorldSnapshot.manifest.contentHash
        : undefined) ||
    !hasAuthoritativeRevisionRecord(
      selected.manifest,
      "campaign-definition-revision",
      selected.campaignDefinitionRevision.id,
      selected.campaignDefinitionRevision.revisionNumber,
      selected.campaignDefinitionRevision.contentHash,
    ) ||
    !hasAuthoritativeRevisionRecord(
      selected.capturedWorldSnapshot.manifest,
      "world-definition-revision",
      selected.capturedWorldSnapshot.worldDefinitionRevision.id,
      selected.capturedWorldSnapshot.worldDefinitionRevision.revisionNumber,
      selected.capturedWorldSnapshot.worldDefinitionRevision.contentHash,
    )
  ) {
    throw new BadRequestException(
      "The selected Campaign Definition snapshot is inconsistent.",
    );
  }
}

function hasAuthoritativeRevisionRecord(
  manifest: unknown,
  resourceType: string,
  sourceId: string,
  sourceRevision: number,
  contentHash: string,
): boolean {
  return (
    isCanonicalSnapshotManifest(manifest) &&
    manifest.records.some(
      (record) =>
        record.resourceType === resourceType &&
        record.sourceId === sourceId &&
        record.sourceRevision === sourceRevision &&
        record.contentHash === contentHash,
    )
  );
}

function replicatedCompatibilityManifest(
  selected: SelectedCampaignDefinitionSnapshotRow,
) {
  const campaignDefinition = {
    snapshotId: selected.id,
    snapshotContentHash: selected.contentHash,
    capturedAt: selected.capturedAt.toISOString(),
    revisionId: selected.campaignDefinitionRevision.id,
    revisionNumber: selected.campaignDefinitionRevision.revisionNumber,
    revisionContentHash: selected.campaignDefinitionRevision.contentHash,
    manifest: selected.manifest,
  };
  const worldDefinition = {
    snapshotId: selected.capturedWorldSnapshot.id,
    snapshotContentHash: selected.capturedWorldSnapshot.contentHash,
    capturedAt: selected.capturedWorldSnapshot.capturedAt.toISOString(),
    revisionId: selected.capturedWorldSnapshot.worldDefinitionRevision.id,
    revisionNumber:
      selected.capturedWorldSnapshot.worldDefinitionRevision.revisionNumber,
    revisionContentHash:
      selected.capturedWorldSnapshot.worldDefinitionRevision.contentHash,
    manifest: selected.capturedWorldSnapshot.manifest,
  };
  return buildSnapshotManifest(1, [
    {
      resourceType: "campaign-definition-snapshot",
      sourceId: selected.id,
      sourceRevision: selected.campaignDefinitionRevision.revisionNumber,
      payload: campaignDefinition,
    },
    {
      resourceType: "world-definition-snapshot",
      sourceId: selected.capturedWorldSnapshot.id,
      sourceRevision:
        selected.capturedWorldSnapshot.worldDefinitionRevision.revisionNumber,
      payload: worldDefinition,
    },
  ]);
}

function initialRuntimeState(
  selected: SelectedCampaignDefinitionSnapshotRow,
  campaignInstanceId: string,
) {
  const campaignRecords = isCanonicalSnapshotManifest(selected.manifest)
    ? selected.manifest.records
    : [];
  const worldRecords = isCanonicalSnapshotManifest(
    selected.capturedWorldSnapshot.manifest,
  )
    ? selected.capturedWorldSnapshot.manifest.records
    : [];
  const content = object(selected.campaignDefinitionRevision.content);
  const preparationDefaults = object(content.preparation);
  const plotProgress = campaignRecords
    .filter((record) => record.resourceType === "plots")
    .map((record) => {
      const plot = object(record.payload);
      return {
        campaignInstanceId,
        plotDefinitionId: record.sourceId,
        status: "not-started",
        objectiveProgress: array(plot.objectives)
          .map(object)
          .filter((objective) => typeof objective.id === "string")
          .map((objective) => ({
            objectiveId: objective.id,
            status: "not-started",
          })),
      };
    });
  const campaignPlacements = campaignRecords.filter(
    (record) => record.resourceType === "campaign-placements",
  );
  const decoratedWorldPlacements = new Set(
    campaignPlacements.flatMap((record) => {
      const placement = object(record.payload);
      return placement.kind === "world-decoration" &&
        typeof placement.capturedWorldPlacementId === "string"
        ? [placement.capturedWorldPlacementId]
        : [];
    }),
  );
  const now = new Date().toISOString();
  const creatureEmbodiments = worldRecords
    .filter((record) => {
      const creature = object(record.payload);
      if (record.resourceType !== "definitions" || creature.kind !== "creature")
        return false;
      const resolved = resolveCreatureInstanceEmbodimentPolicy(
        creature.instanceEmbodimentPolicy,
      );
      return resolved?.policy.strategy === "one-per-instance";
    })
    .map((record) => {
      const captured = object(record.payload);
      const policy = resolveCreatureInstanceEmbodimentPolicy(
        captured.instanceEmbodimentPolicy,
      )!;
      const runtimeCreatureId = randomUUID();
      const runtimeEntityId = randomUUID();
      return {
        campaignInstanceId,
        runtimeCreatureId,
        runtimeEntityId,
        source: {
          kind: "captured-world-creature",
          sourceCreatureId: record.sourceId,
          embodimentPolicy: policy,
        },
        creature: {
          identity: {
            id: runtimeCreatureId,
            version: { revision: 1, updatedAt: now },
          },
          entityId: runtimeEntityId,
          name: humanName(captured, "Unnamed Creature"),
          definitionId: record.sourceId,
        },
      };
    });
  const placementRealizations = [
    ...campaignPlacements.map((record) => {
      const placement = object(record.payload);
      return {
        identity: {
          id: randomUUID(),
          version: { revision: 1, updatedAt: now },
        },
        name:
          typeof placement.name === "string" && placement.name.trim()
            ? placement.name.trim()
            : "Campaign placement",
        campaignInstanceId,
        source: {
          kind: "campaign-placement",
          campaignPlacementDefinitionId: record.sourceId,
          ...(typeof placement.capturedWorldPlacementId === "string"
            ? {
                capturedWorldPlacementDefinitionId:
                  placement.capturedWorldPlacementId,
              }
            : {}),
        },
        sourceLocationId:
          typeof placement.locationId === "string" ? placement.locationId : "",
        status: "planned",
      };
    }),
    ...worldRecords
      .filter(
        (record) =>
          record.resourceType === "world-placements" &&
          !decoratedWorldPlacements.has(record.sourceId),
      )
      .map((record) => {
        const placement = object(record.payload);
        return {
          identity: {
            id: randomUUID(),
            version: { revision: 1, updatedAt: now },
          },
          name:
            typeof placement.name === "string" && placement.name.trim()
              ? placement.name.trim()
              : "World placement",
          campaignInstanceId,
          source: {
            kind: "captured-world-placement",
            worldPlacementDefinitionId: record.sourceId,
          },
          sourceLocationId:
            typeof placement.locationId === "string"
              ? placement.locationId
              : "",
          status: "planned",
        };
      }),
  ];
  return {
    formatVersion: 1,
    preparation: {
      ...(typeof preparationDefaults.startingLocationId === "string"
        ? { startingLocationId: preparationDefaults.startingLocationId }
        : {}),
      ...(typeof preparationDefaults.startingContext === "string"
        ? { startingContext: preparationDefaults.startingContext }
        : {}),
      ...(typeof preparationDefaults.mapVariations === "string"
        ? { mapVariations: preparationDefaults.mapVariations }
        : {}),
      ...(Array.isArray(preparationDefaults.locationCanvases)
        ? { locationCanvases: preparationDefaults.locationCanvases }
        : {}),
      ...(preparationDefaults.extensions &&
      typeof preparationDefaults.extensions === "object" &&
      !Array.isArray(preparationDefaults.extensions)
        ? { extensions: preparationDefaults.extensions }
        : {}),
    },
    plotProgress,
    placementRealizations,
    creatureEmbodiments,
    itemInstances: [],
  };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function humanName(value: Record<string, unknown>, fallback: string) {
  return typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : fallback;
}

function selectedDefinition(selected: SelectedCampaignDefinitionSnapshotRow) {
  return {
    definitionId: selected.campaignDefinitionId,
    revisionNumber: selected.campaignDefinitionRevision.revisionNumber,
    name: selected.campaignDefinitionRevision.name,
    authoringHref: `/campaigns/definitions/${selected.campaignDefinitionId}`,
  };
}

function selectedWorld(
  selected: SelectedCampaignDefinitionSnapshotRow["capturedWorldSnapshot"],
) {
  return {
    definitionId: selected.worldDefinitionId,
    revisionNumber: selected.worldDefinitionRevision.revisionNumber,
    name: selected.worldDefinitionRevision.name,
    authoringHref: `/worlds/${selected.worldDefinitionId}`,
  };
}

function revisionSummary(
  row: CapturedRevisionSummaryRow,
  kind: "campaign" | "world",
) {
  return {
    definitionId:
      kind === "campaign" ? row.campaignDefinitionId : row.worldDefinitionId,
    name: row.name,
    revisionNumber: row.revisionNumber,
    authoringHref:
      kind === "campaign"
        ? `/campaigns/definitions/${row.campaignDefinitionId}`
        : `/worlds/${row.worldDefinitionId}`,
  };
}

function iso(value: Date | null): string | undefined {
  return value?.toISOString();
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
