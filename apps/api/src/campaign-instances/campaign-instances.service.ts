import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  buildSnapshotManifest,
  isCanonicalSnapshotManifest,
} from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCampaignInstanceDto } from "./dto/create-campaign-instance.dto";

interface CapturedRevisionSummaryRow {
  readonly revisionNumber: number;
  readonly name: string;
}

interface CampaignInstanceListRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: Date;
  readonly currentSnapshot: {
    readonly snapshotNumber: number;
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
  readonly name: string;
  readonly status: string;
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
    findUnique(args: unknown): Promise<CampaignInstanceDetailRow | null>;
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
    }>;
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
}

export interface CampaignInstanceStore extends CampaignInstanceReader {
  readonly $transaction?: (
    operation: (tx: CampaignInstanceCreateTransaction) => Promise<unknown>,
    options: { readonly isolationLevel: unknown },
  ) => Promise<unknown>;
}

const revisionSummarySelect = {
  revisionNumber: true,
  name: true,
} as const;

const listSelect = {
  id: true,
  name: true,
  status: true,
  updatedAt: true,
  currentSnapshot: {
    select: {
      snapshotNumber: true,
      campaignDefinitionSnapshot: {
        select: {
          campaignDefinitionRevision: { select: revisionSummarySelect },
        },
      },
      worldDefinitionSnapshot: {
        select: {
          worldDefinitionRevision: { select: revisionSummarySelect },
        },
      },
    },
  },
} as const;

const revisionDetailSelect = {
  id: true,
  revisionNumber: true,
  name: true,
  contentHash: true,
  publishedAt: true,
} as const;

const detailSelect = {
  id: true,
  name: true,
  status: true,
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
      adoptedAt: true,
      campaignDefinitionSnapshot: {
        select: {
          id: true,
          contentHash: true,
          capturedAt: true,
          campaignDefinitionRevision: { select: revisionDetailSelect },
        },
      },
      worldDefinitionSnapshot: {
        select: {
          id: true,
          contentHash: true,
          capturedAt: true,
          worldDefinitionRevision: { select: revisionDetailSelect },
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
      worldDefinitionRevision: { select: revisionDetailSelect },
    },
  },
} as const;

@Injectable()
export class CampaignInstancesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: CampaignInstanceStore,
  ) {}

  async list(createdByUserId: string) {
    let rows: readonly CampaignInstanceListRow[];
    try {
      rows = await this.prisma.campaignInstance.findMany({
        where: { createdByUserId },
        select: listSelect,
        orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
      });
    } catch {
      this.unavailable();
    }

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status.toLowerCase(),
        updatedAt: row.updatedAt.toISOString(),
        currentSnapshot: row.currentSnapshot
          ? {
              snapshotNumber: row.currentSnapshot.snapshotNumber,
              campaignDefinition: revisionSummary(
                row.currentSnapshot.campaignDefinitionSnapshot
                  .campaignDefinitionRevision,
              ),
              worldDefinition: revisionSummary(
                row.currentSnapshot.worldDefinitionSnapshot
                  .worldDefinitionRevision,
              ),
            }
          : undefined,
      })),
      total: rows.length,
    };
  }

  async get(id: string, createdByUserId: string) {
    let row: CampaignInstanceDetailRow | null;
    try {
      row = await this.prisma.campaignInstance.findUnique({
        where: { id, createdByUserId },
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
      name: row.name,
      status: row.status.toLowerCase(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      concludedAt: iso(row.concludedAt),
      archivedAt: iso(row.archivedAt),
      currentSnapshot: row.currentSnapshot
        ? {
            id: row.currentSnapshot.id,
            snapshotNumber: row.currentSnapshot.snapshotNumber,
            predecessorSnapshotId:
              row.currentSnapshot.predecessorSnapshotId ?? undefined,
            reason: row.currentSnapshot.reason.toLowerCase(),
            contentHash: row.currentSnapshot.contentHash,
            adoptedAt: row.currentSnapshot.adoptedAt.toISOString(),
            campaignDefinition: capturedDefinition(
              row.currentSnapshot.campaignDefinitionSnapshot,
              row.currentSnapshot.campaignDefinitionSnapshot
                .campaignDefinitionRevision,
            ),
            worldDefinition: capturedDefinition(
              row.currentSnapshot.worldDefinitionSnapshot,
              row.currentSnapshot.worldDefinitionSnapshot
                .worldDefinitionRevision,
            ),
          }
        : undefined,
      runtime: row.runtime
        ? {
            id: row.runtime.id,
            campaignInstanceSnapshotId: row.runtime.campaignInstanceSnapshotId,
            revision: row.runtime.revision,
            updatedAt: row.runtime.updatedAt.toISOString(),
          }
        : undefined,
    };
  }

  async create(dto: CreateCampaignInstanceDto, createdByUserId: string) {
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
    if (!this.prisma.$transaction) this.unavailable();

    try {
      return (await this.prisma.$transaction(
        async (tx) => {
          const selected = await tx.campaignDefinitionSnapshot.findUnique({
            where: {
              id: selectedSnapshotId,
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
            },
            select: { id: true, name: true, status: true, createdAt: true },
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
          const runtime = await tx.campaignInstanceRuntime.create({
            data: {
              campaignInstanceId: instance.id,
              campaignInstanceSnapshotId: snapshot.id,
              state: { formatVersion: 1 },
              extensions: {},
            },
            select: { id: true, revision: true, updatedAt: true },
          });
          await tx.campaignInstance.update({
            where: { id: instance.id },
            data: { currentSnapshotId: snapshot.id },
          });

          return {
            id: instance.id,
            name: instance.name,
            status: instance.status.toLowerCase(),
            createdAt: instance.createdAt.toISOString(),
            currentSnapshot: {
              id: snapshot.id,
              snapshotNumber: snapshot.snapshotNumber,
              reason: snapshot.reason.toLowerCase(),
              contentHash: snapshot.contentHash,
              adoptedAt: snapshot.adoptedAt.toISOString(),
              campaignDefinition: selectedDefinition(selected),
              worldDefinition: selectedWorld(selected.capturedWorldSnapshot),
            },
            runtime: {
              id: runtime.id,
              revision: runtime.revision,
              updatedAt: runtime.updatedAt.toISOString(),
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )) as Record<string, unknown>;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.unavailable();
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

function selectedDefinition(selected: SelectedCampaignDefinitionSnapshotRow) {
  return {
    snapshotId: selected.id,
    revisionId: selected.campaignDefinitionRevision.id,
    revisionNumber: selected.campaignDefinitionRevision.revisionNumber,
    name: selected.campaignDefinitionRevision.name,
  };
}

function selectedWorld(
  selected: SelectedCampaignDefinitionSnapshotRow["capturedWorldSnapshot"],
) {
  return {
    snapshotId: selected.id,
    revisionId: selected.worldDefinitionRevision.id,
    revisionNumber: selected.worldDefinitionRevision.revisionNumber,
    name: selected.worldDefinitionRevision.name,
  };
}

function revisionSummary(row: CapturedRevisionSummaryRow) {
  return { name: row.name, revisionNumber: row.revisionNumber };
}

function capturedDefinition(
  snapshot: CapturedDefinitionDetailRow,
  revision: CapturedRevisionDetailRow,
) {
  return {
    snapshotId: snapshot.id,
    snapshotContentHash: snapshot.contentHash,
    capturedAt: snapshot.capturedAt.toISOString(),
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    name: revision.name,
    revisionContentHash: revision.contentHash,
    publishedAt: revision.publishedAt.toISOString(),
  };
}

function iso(value: Date | null): string | undefined {
  return value?.toISOString();
}
