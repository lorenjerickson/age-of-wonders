import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
  isPublicationJson,
  type CanonicalSnapshotManifest,
} from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateCampaignDefinitionDto,
  PublishCampaignDefinitionRevisionDto,
} from "./dto/campaign-definition-write.dto";

interface CapturedWorldSummaryRow {
  readonly id: string;
  readonly worldDefinitionId: string;
  readonly worldDefinitionRevisionId: string;
  readonly contentHash: string;
  readonly capturedAt: Date;
  readonly worldDefinitionRevision: {
    readonly revisionNumber: number;
    readonly name: string;
    readonly publishedAt: Date;
  };
}

interface CapturedWorldDetailRow extends CapturedWorldSummaryRow {
  readonly worldDefinitionRevision: CapturedWorldSummaryRow["worldDefinitionRevision"] & {
    readonly contentHash: string;
  };
}

interface CampaignDefinitionListRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
  readonly currentRevision: {
    readonly id: string;
    readonly revisionNumber: number;
    readonly name: string;
    readonly contentHash: string;
    readonly publishedAt: Date;
    readonly capturedWorldSnapshot: CapturedWorldSummaryRow;
  } | null;
}

interface CampaignDefinitionDetailRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly currentRevisionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly currentRevision: {
    readonly id: string;
    readonly revisionNumber: number;
    readonly predecessorRevisionId: string | null;
    readonly name: string;
    readonly content: unknown;
    readonly contentHash: string;
    readonly createdAt: Date;
    readonly publishedAt: Date;
    readonly capturedWorldSnapshot: CapturedWorldDetailRow;
  } | null;
}

/** Narrow read capability used by this aggregate-specific API. */
export interface CampaignDefinitionReader {
  readonly campaignDefinition: {
    findMany(args: unknown): Promise<readonly CampaignDefinitionListRow[]>;
    findUnique(args: unknown): Promise<CampaignDefinitionDetailRow | null>;
  };
}

interface SelectedWorldSnapshotRow {
  readonly id: string;
  readonly worldDefinitionId: string;
  readonly worldDefinitionRevisionId: string;
  readonly contentHash: string;
}

interface CampaignDefinitionWriteTransaction {
  readonly worldDefinitionSnapshot: {
    findUnique(args: unknown): Promise<SelectedWorldSnapshotRow | null>;
  };
  readonly campaignDefinition: {
    create(
      args: unknown,
    ): Promise<{ readonly id: string; readonly name: string }>;
    findUnique(args: unknown): Promise<{
      readonly id: string;
      readonly name: string;
      readonly status: string;
      readonly worldDefinitionId: string;
      readonly currentRevisionId: string | null;
      readonly currentRevision: {
        readonly id: string;
        readonly revisionNumber: number;
      } | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ readonly count: number }>;
  };
  readonly campaignDefinitionRevision: {
    create(args: unknown): Promise<{
      readonly id: string;
      readonly revisionNumber: number;
      readonly name: string;
      readonly contentHash: string;
    }>;
  };
  readonly campaignDefinitionSnapshot: {
    create(args: unknown): Promise<{
      readonly id: string;
      readonly contentHash: string;
      readonly capturedAt: Date;
    }>;
  };
}

export interface CampaignDefinitionStore extends CampaignDefinitionReader {
  readonly $transaction?: (
    operation: (tx: CampaignDefinitionWriteTransaction) => Promise<unknown>,
    options: { readonly isolationLevel: unknown },
  ) => Promise<unknown>;
}

const capturedWorldSummarySelect = {
  id: true,
  worldDefinitionId: true,
  worldDefinitionRevisionId: true,
  contentHash: true,
  capturedAt: true,
  worldDefinitionRevision: {
    select: {
      revisionNumber: true,
      name: true,
      publishedAt: true,
    },
  },
} as const;

const listSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  archivedAt: true,
  updatedAt: true,
  currentRevision: {
    select: {
      id: true,
      revisionNumber: true,
      name: true,
      contentHash: true,
      publishedAt: true,
      capturedWorldSnapshot: { select: capturedWorldSummarySelect },
    },
  },
} as const;

const detailSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  currentRevisionId: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  currentRevision: {
    select: {
      id: true,
      revisionNumber: true,
      predecessorRevisionId: true,
      name: true,
      content: true,
      contentHash: true,
      createdAt: true,
      publishedAt: true,
      capturedWorldSnapshot: {
        select: {
          ...capturedWorldSummarySelect,
          worldDefinitionRevision: {
            select: {
              ...capturedWorldSummarySelect.worldDefinitionRevision.select,
              contentHash: true,
            },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class CampaignDefinitionsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: CampaignDefinitionStore,
  ) {}

  async list(ownerUserId: string) {
    let rows: readonly CampaignDefinitionListRow[];
    try {
      rows = await this.prisma.campaignDefinition.findMany({
        where: { ownerUserId },
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
        description: row.description ?? undefined,
        status: row.status.toLowerCase(),
        archivedAt: iso(row.archivedAt),
        updatedAt: row.updatedAt.toISOString(),
        currentRevision: row.currentRevision
          ? {
              id: row.currentRevision.id,
              revisionNumber: row.currentRevision.revisionNumber,
              name: row.currentRevision.name,
              contentHash: row.currentRevision.contentHash,
              publishedAt: row.currentRevision.publishedAt.toISOString(),
              capturedWorld: capturedWorldSummary(
                row.currentRevision.capturedWorldSnapshot,
              ),
            }
          : undefined,
      })),
      total: rows.length,
    };
  }

  async get(id: string, ownerUserId: string) {
    let row: CampaignDefinitionDetailRow | null;
    try {
      row = await this.prisma.campaignDefinition.findUnique({
        where: { id, ownerUserId },
        select: detailSelect,
      });
    } catch {
      this.unavailable();
    }

    if (!row) {
      throw new NotFoundException(
        "The selected Campaign Definition was not found.",
      );
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status.toLowerCase(),
      currentRevisionId: row.currentRevisionId ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: iso(row.archivedAt),
      currentRevision: row.currentRevision
        ? {
            id: row.currentRevision.id,
            revisionNumber: row.currentRevision.revisionNumber,
            predecessorRevisionId:
              row.currentRevision.predecessorRevisionId ?? undefined,
            name: row.currentRevision.name,
            content: row.currentRevision.content,
            contentHash: row.currentRevision.contentHash,
            createdAt: row.currentRevision.createdAt.toISOString(),
            publishedAt: row.currentRevision.publishedAt.toISOString(),
            capturedWorld: capturedWorldDetail(
              row.currentRevision.capturedWorldSnapshot,
            ),
          }
        : undefined,
    };
  }

  async create(dto: CreateCampaignDefinitionDto, userId: string) {
    const name = requiredText(
      dto.name,
      "A Campaign Definition name is required.",
    );
    const worldSnapshotId = requiredText(
      dto.worldDefinitionSnapshotId,
      "A World Definition snapshot selection is required.",
    );
    assertCompleteContent(dto.content);
    const suppliedManifest = completeSnapshotManifest(dto.snapshotManifest);
    if (!this.prisma.$transaction) this.unavailable();

    return this.write(async (tx) => {
      const world = await loadWorldSnapshot(tx, worldSnapshotId, userId);
      const lineage = await tx.campaignDefinition.create({
        data: {
          worldDefinitionId: world.worldDefinitionId,
          name,
          description: dto.description?.trim() || null,
          status: "ACTIVE",
          ownerUserId: userId,
        },
        select: { id: true, name: true },
      });
      const revision = await tx.campaignDefinitionRevision.create({
        data: {
          campaignDefinitionId: lineage.id,
          worldDefinitionId: world.worldDefinitionId,
          capturedWorldSnapshotId: world.id,
          revisionNumber: 1,
          name,
          content: dto.content,
          contentHash: canonicalJsonHash(dto.content),
          createdByUserId: userId,
        },
        select: revisionWriteSelect,
      });
      const snapshot = await createCampaignSnapshot(
        tx,
        lineage.id,
        revision.id,
        world.id,
        withAuthoritativeRevision(
          suppliedManifest,
          revision.id,
          revision.revisionNumber,
          dto.content,
        ),
      );
      await tx.campaignDefinition.update({
        where: { id: lineage.id },
        data: { currentRevisionId: revision.id },
      });
      return writeResponse(lineage, revision, snapshot, world);
    });
  }

  async publishRevision(
    campaignDefinitionId: string,
    dto: PublishCampaignDefinitionRevisionDto,
    userId: string,
  ) {
    const predecessorRevisionId = requiredText(
      dto.predecessorRevisionId,
      "A predecessor Campaign revision is required.",
    );
    const worldSnapshotId = requiredText(
      dto.worldDefinitionSnapshotId,
      "A World Definition snapshot selection is required.",
    );
    const revisionName = requiredText(
      dto.name,
      "A Campaign revision name is required.",
    );
    assertCompleteContent(dto.content);
    const suppliedManifest = completeSnapshotManifest(dto.snapshotManifest);
    if (!this.prisma.$transaction) this.unavailable();

    return this.write(async (tx) => {
      const [lineage, world] = await Promise.all([
        tx.campaignDefinition.findUnique({
          where: { id: campaignDefinitionId, ownerUserId: userId },
          select: {
            id: true,
            name: true,
            status: true,
            worldDefinitionId: true,
            currentRevisionId: true,
            currentRevision: { select: { id: true, revisionNumber: true } },
          },
        }),
        loadWorldSnapshot(tx, worldSnapshotId, userId),
      ]);
      if (!lineage) {
        throw new NotFoundException(
          "The selected Campaign Definition was not found.",
        );
      }
      if (lineage.status !== "ACTIVE") {
        throw new ConflictException(
          "An archived Campaign Definition cannot publish a new revision.",
        );
      }
      if (
        lineage.currentRevisionId !== predecessorRevisionId ||
        lineage.currentRevision?.id !== predecessorRevisionId
      ) {
        throw new ConflictException(
          "The Campaign Definition has changed; refresh before publishing.",
        );
      }
      if (world.worldDefinitionId !== lineage.worldDefinitionId) {
        throw new BadRequestException(
          "The selected World snapshot belongs to a different World Definition.",
        );
      }

      const revision = await tx.campaignDefinitionRevision.create({
        data: {
          campaignDefinitionId: lineage.id,
          worldDefinitionId: lineage.worldDefinitionId,
          capturedWorldSnapshotId: world.id,
          revisionNumber: lineage.currentRevision.revisionNumber + 1,
          predecessorRevisionId,
          name: revisionName,
          content: dto.content,
          contentHash: canonicalJsonHash(dto.content),
          createdByUserId: userId,
        },
        select: revisionWriteSelect,
      });
      const snapshot = await createCampaignSnapshot(
        tx,
        lineage.id,
        revision.id,
        world.id,
        withAuthoritativeRevision(
          suppliedManifest,
          revision.id,
          revision.revisionNumber,
          dto.content,
        ),
      );
      const advanced = await tx.campaignDefinition.updateMany({
        where: { id: lineage.id, currentRevisionId: predecessorRevisionId },
        data: { currentRevisionId: revision.id },
      });
      if (advanced.count !== 1) {
        throw new ConflictException(
          "The Campaign Definition has changed; refresh before publishing.",
        );
      }
      return writeResponse(
        { id: lineage.id, name: lineage.name },
        revision,
        snapshot,
        world,
      );
    });
  }

  private async write(
    operation: (tx: CampaignDefinitionWriteTransaction) => Promise<unknown>,
  ) {
    try {
      return await this.prisma.$transaction!(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (isConcurrentPublicationFailure(error)) {
        throw new ConflictException(
          "The Campaign Definition has changed; refresh before publishing.",
        );
      }
      this.unavailable();
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException(
      "Campaign Definitions are temporarily unavailable.",
    );
  }
}

const revisionWriteSelect = {
  id: true,
  revisionNumber: true,
  name: true,
  contentHash: true,
} as const;

async function loadWorldSnapshot(
  tx: CampaignDefinitionWriteTransaction,
  id: string,
  ownerUserId: string,
) {
  const world = await tx.worldDefinitionSnapshot.findUnique({
    where: { id, worldDefinition: { ownerUserId } },
    select: {
      id: true,
      worldDefinitionId: true,
      worldDefinitionRevisionId: true,
      contentHash: true,
    },
  });
  if (!world) {
    throw new NotFoundException(
      "The selected World Definition snapshot was not found.",
    );
  }
  return world;
}

async function createCampaignSnapshot(
  tx: CampaignDefinitionWriteTransaction,
  campaignDefinitionId: string,
  campaignDefinitionRevisionId: string,
  capturedWorldSnapshotId: string,
  manifest: CanonicalSnapshotManifest,
) {
  return tx.campaignDefinitionSnapshot.create({
    data: {
      campaignDefinitionId,
      campaignDefinitionRevisionId,
      capturedWorldSnapshotId,
      manifest,
      contentHash: manifest.contentHash,
    },
    select: { id: true, contentHash: true, capturedAt: true },
  });
}

function writeResponse(
  lineage: { readonly id: string; readonly name: string },
  revision: {
    readonly id: string;
    readonly revisionNumber: number;
    readonly name: string;
    readonly contentHash: string;
  },
  snapshot: {
    readonly id: string;
    readonly contentHash: string;
    readonly capturedAt: Date;
  },
  world: SelectedWorldSnapshotRow,
) {
  return {
    id: lineage.id,
    name: lineage.name,
    currentRevision: {
      ...revision,
      snapshotId: snapshot.id,
      snapshotContentHash: snapshot.contentHash,
      capturedAt: snapshot.capturedAt.toISOString(),
      capturedWorld: {
        snapshotId: world.id,
        worldDefinitionId: world.worldDefinitionId,
        worldDefinitionRevisionId: world.worldDefinitionRevisionId,
      },
    },
  };
}

function requiredText(value: string | undefined, message: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException(message);
  return normalized;
}

function assertCompleteContent(
  content: Record<string, unknown> | undefined,
): void {
  if (!isJsonObject(content) || !isPublicationJson(content)) {
    throw new BadRequestException(
      "Complete Campaign revision content must be a bounded JSON object.",
    );
  }
}

function completeSnapshotManifest(
  input: unknown,
): CanonicalSnapshotManifest {
  if (
    !isJsonObject(input) ||
    !Number.isInteger(input.formatVersion) ||
    Number(input.formatVersion) < 1 ||
    !Array.isArray(input.records) ||
    input.records.length === 0
  ) {
    throw incompleteManifest();
  }
  const records = input.records.map((value) => {
    if (!isJsonObject(value)) throw incompleteManifest();
    const resourceType = value.resourceType;
    const sourceId = value.sourceId;
    const sourceRevision = value.sourceRevision;
    if (
      typeof resourceType !== "string" ||
      resourceType.trim() === "" ||
      typeof sourceId !== "string" ||
      sourceId.trim() === "" ||
      !("payload" in value) ||
      !isPublicationJson(value.payload) ||
      (sourceRevision !== undefined &&
        (!Number.isInteger(sourceRevision) || Number(sourceRevision) < 1))
    ) {
      throw incompleteManifest();
    }
    return {
      resourceType,
      sourceId,
      ...(typeof sourceRevision === "number" ? { sourceRevision } : {}),
      payload: value.payload,
    };
  });
  return buildSnapshotManifest(Number(input.formatVersion), records);
}

function withAuthoritativeRevision(
  supplied: CanonicalSnapshotManifest,
  revisionId: string,
  revisionNumber: number,
  content: unknown,
): CanonicalSnapshotManifest {
  return buildSnapshotManifest(supplied.formatVersion, [
    {
      resourceType: "campaign-definition-revision",
      sourceId: revisionId,
      sourceRevision: revisionNumber,
      payload: content,
    },
    ...supplied.records,
  ]);
}

function incompleteManifest() {
  return new BadRequestException(
    "A complete Campaign snapshot manifest with at least one record is required.",
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function capturedWorldSummary(row: CapturedWorldSummaryRow) {
  return {
    snapshotId: row.id,
    worldDefinitionId: row.worldDefinitionId,
    worldDefinitionRevisionId: row.worldDefinitionRevisionId,
    revisionNumber: row.worldDefinitionRevision.revisionNumber,
    name: row.worldDefinitionRevision.name,
  };
}

function capturedWorldDetail(row: CapturedWorldDetailRow) {
  return {
    ...capturedWorldSummary(row),
    snapshotContentHash: row.contentHash,
    capturedAt: row.capturedAt.toISOString(),
    revisionContentHash: row.worldDefinitionRevision.contentHash,
    publishedAt: row.worldDefinitionRevision.publishedAt.toISOString(),
  };
}

function iso(value: Date | null): string | undefined {
  return value?.toISOString();
}

function isConcurrentPublicationFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}
