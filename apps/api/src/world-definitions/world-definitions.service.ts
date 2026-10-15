import { DefinitionLineage } from "@aow/domain";
import { randomUUID } from "node:crypto";
import { worldAccessWhere } from "./world-access";
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
  type SnapshotRecordInput,
} from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateWorldDefinitionDto } from "./dto/create-world-definition.dto";
import type { PublishWorldDefinitionRevisionDto } from "./dto/publish-world-definition-revision.dto";

const listSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  archivedAt: true,
  metadataRevision: true,
  updatedAt: true,
  draft: {
    select: {
      storageRevision: true,
      revisionName: true,
      validationStatus: true,
      validatedStorageRevision: true,
      baseRevisionId: true,
    },
  },
  currentRevision: {
    select: {
      id: true,
      revisionNumber: true,
      name: true,
      contentHash: true,
      publishedAt: true,
      sourceDraftRevision: true,
      snapshots: {
        select: { id: true },
        orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
        take: 1,
      },
    },
  },
} as const satisfies Prisma.WorldDefinitionSelect;

const detailSelect = {
  id: true,
  ownerUserId: true,
  accessEntries: {
    select: {
      role: true,
      player: { select: { userId: true, standing: true } },
    },
  },
  name: true,
  description: true,
  status: true,
  currentRevisionId: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  metadataRevision: true,
  revisions: {
    select: {
      id: true,
      revisionNumber: true,
      predecessorRevisionId: true,
      name: true,
      content: true,
      contentHash: true,
      createdAt: true,
      publishedAt: true,
      snapshots: {
        select: {
          id: true,
          manifest: true,
          contentHash: true,
          capturedAt: true,
        },
        orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
      },
    },
    orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
  },
} as const satisfies Prisma.WorldDefinitionSelect;

type ListRow = Prisma.WorldDefinitionGetPayload<{ select: typeof listSelect }>;
type DetailRow = Prisma.WorldDefinitionGetPayload<{
  select: typeof detailSelect;
}>;

interface WorldDefinitionReader {
  readonly worldDefinition: {
    findMany(args: unknown): Promise<readonly ListRow[]>;
    findUnique(args: unknown): Promise<DetailRow | null>;
  };
}

interface CreatedWorldDefinitionRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly createdAt: Date;
}

interface CreatedWorldRevisionRow {
  readonly id: string;
  readonly revisionNumber: number;
  readonly name: string;
  readonly contentHash: string;
  readonly publishedAt: Date;
}

interface CreatedWorldSnapshotRow {
  readonly id: string;
  readonly contentHash: string;
  readonly capturedAt: Date;
}

interface WorldDefinitionPublicationTransaction {
  readonly worldDefinition: {
    create(args: unknown): Promise<CreatedWorldDefinitionRow>;
    findUnique(args: unknown): Promise<{
      readonly id: string;
      readonly status: string;
      readonly currentRevisionId: string | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ readonly count: number }>;
  };
  readonly worldDefinitionRevision: {
    findUnique(args: unknown): Promise<{
      readonly id: string;
      readonly worldDefinitionId: string;
      readonly revisionNumber: number;
    } | null>;
    create(args: unknown): Promise<CreatedWorldRevisionRow>;
  };
  readonly worldDefinitionSnapshot: {
    create(args: unknown): Promise<CreatedWorldSnapshotRow>;
  };
}

interface WorldDefinitionStore extends WorldDefinitionReader {
  readonly $transaction?: (
    operation: (
      transaction: WorldDefinitionPublicationTransaction,
    ) => Promise<unknown>,
    options: { readonly isolationLevel: unknown },
  ) => Promise<unknown>;
}

@Injectable()
export class WorldDefinitionsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: WorldDefinitionStore,
  ) {}

  async list(ownerUserId: string) {
    let rows: readonly ListRow[];
    try {
      rows = await this.prisma.worldDefinition.findMany({
        where: worldAccessWhere(ownerUserId),
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
        status: row.status.toLowerCase() as "active" | "archived",
        archivedAt: iso(row.archivedAt),
        metadataRevision: row.metadataRevision,
        updatedAt: row.updatedAt.toISOString(),
        draft: row.draft
          ? {
              revisionName: row.draft.revisionName,
              storageRevision: row.draft.storageRevision,
              validationStatus: row.draft.validationStatus
                .toLowerCase()
                .replaceAll("_", "-"),
              validatedStorageRevision:
                row.draft.validatedStorageRevision ?? undefined,
              isCurrentBase:
                (row.draft.baseRevisionId ?? null) ===
                (row.currentRevision?.id ?? null),
              hasUnpublishedChanges:
                !row.currentRevision ||
                row.draft.storageRevision !==
                  (row.currentRevision.sourceDraftRevision ?? 0) + 1,
            }
          : undefined,
        currentRevision: row.currentRevision
          ? {
              id: row.currentRevision.id,
              revisionNumber: row.currentRevision.revisionNumber,
              name: row.currentRevision.name,
              contentHash: row.currentRevision.contentHash,
              publishedAt: row.currentRevision.publishedAt.toISOString(),
              snapshotId: row.currentRevision.snapshots?.[0]?.id,
            }
          : undefined,
      })),
      total: rows.length,
    };
  }

  async get(id: string, ownerUserId: string) {
    let row: DetailRow | null;
    try {
      row = await this.prisma.worldDefinition.findUnique({
        where: { id, ...worldAccessWhere(ownerUserId) },
        select: detailSelect,
      });
    } catch {
      this.unavailable();
    }

    if (!row) {
      throw new NotFoundException(
        "The selected World Definition was not found.",
      );
    }

    return {
      id: row.id,
      accessRole:
        row.ownerUserId === ownerUserId
          ? ("owner" as const)
          : row.accessEntries?.find(
                (entry) =>
                  entry.player.userId === ownerUserId &&
                  entry.player.standing === "ACTIVE",
              )?.role === "editor"
            ? ("editor" as const)
            : ("viewer" as const),
      name: row.name,
      description: row.description ?? undefined,
      status: row.status.toLowerCase() as "active" | "archived",
      currentRevisionId: row.currentRevisionId ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: iso(row.archivedAt),
      metadataRevision: row.metadataRevision,
      revisions: row.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        predecessorRevisionId: revision.predecessorRevisionId ?? undefined,
        name: revision.name,
        content: revision.content,
        contentHash: revision.contentHash,
        createdAt: revision.createdAt.toISOString(),
        publishedAt: revision.publishedAt.toISOString(),
        snapshots: revision.snapshots.map((snapshot) => ({
          id: snapshot.id,
          manifest: snapshot.manifest,
          contentHash: snapshot.contentHash,
          capturedAt: snapshot.capturedAt.toISOString(),
        })),
      })),
    };
  }

  async create(dto: CreateWorldDefinitionDto, createdByUserId: string) {
    const name = visible(dto.name, "A World Definition name is required.");
    assertCompletePublication(dto.content, dto.snapshotManifest);
    if (!this.prisma.$transaction) this.unavailable();

    const description = dto.description?.trim() || null;
    const revisionContentHash = canonicalJsonHash(dto.content);

    try {
      return (await this.prisma.$transaction(
        async (transaction) => {
          const world = await transaction.worldDefinition.create({
            data: { name, description, ownerUserId: createdByUserId },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              createdAt: true,
            },
          });
          const revision = await transaction.worldDefinitionRevision.create({
            data: {
              worldDefinitionId: world.id,
              revisionNumber: 1,
              predecessorRevisionId: null,
              name,
              content: dto.content,
              contentHash: revisionContentHash,
              createdByUserId,
            },
            select: publicationRevisionSelect,
          });
          const completedManifest = completeManifest(dto.snapshotManifest, {
            resourceType: "world-definition-revision",
            sourceId: revision.id,
            sourceRevision: revision.revisionNumber,
            payload: dto.content,
          });
          const snapshot = await transaction.worldDefinitionSnapshot.create({
            data: {
              worldDefinitionId: world.id,
              worldDefinitionRevisionId: revision.id,
              manifest: completedManifest,
              contentHash: completedManifest.contentHash,
            },
            select: publicationSnapshotSelect,
          });
          await transaction.worldDefinition.update({
            where: { id: world.id },
            data: { currentRevisionId: revision.id },
          });

          return createdWorldResponse(world, revision, snapshot);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )) as ReturnType<typeof createdWorldResponse>;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.unavailable();
    }
  }

  async publishRevision(
    worldDefinitionId: string,
    dto: PublishWorldDefinitionRevisionDto,
    createdByUserId: string,
  ) {
    const revisionName = visible(dto.name, "A revision name is required.");
    const predecessorRevisionId = visible(
      dto.predecessorRevisionId,
      "A direct predecessor revision is required.",
    );
    assertCompletePublication(dto.content, dto.snapshotManifest);
    if (!this.prisma.$transaction) this.unavailable();

    const revisionContentHash = canonicalJsonHash(dto.content);

    try {
      return (await this.prisma.$transaction(
        async (transaction) => {
          const world = await transaction.worldDefinition.findUnique({
            where: { id: worldDefinitionId, ownerUserId: createdByUserId },
            select: { id: true, status: true, currentRevisionId: true },
          });
          if (!world) {
            throw new NotFoundException(
              "The selected World Definition was not found.",
            );
          }
          if (world.status !== "ACTIVE") {
            throw new ConflictException(
              "An archived World Definition cannot publish a new revision.",
            );
          }

          const predecessor =
            await transaction.worldDefinitionRevision.findUnique({
              where: {
                worldDefinitionId_id: {
                  worldDefinitionId: world.id,
                  id: predecessorRevisionId,
                },
              },
              select: {
                id: true,
                worldDefinitionId: true,
                revisionNumber: true,
              },
            });
          if (!predecessor || world.currentRevisionId !== predecessor.id) {
            throw stalePredecessor();
          }

          const lineage = DefinitionLineage.deserializePayload({ status: world.status, currentRevisionId: predecessor.id, revisionNumber: predecessor.revisionNumber });
          const revisionId = randomUUID();
          let nextRevisionNumber: number;
          try {
            await lineage.command("publish", { initiator: createdByUserId, params: {
              revisionId, baseRevisionId: predecessor.id, storageRevision: 0,
              expectedStorageRevision: 0, validationStatus: "VALID", validatedStorageRevision: 0,
            }, context: {} });
            nextRevisionNumber = lineage.state.data.revisionNumber;
          } finally { lineage.dispose(); }
          const revision = await transaction.worldDefinitionRevision.create({
            data: {
              worldDefinitionId: world.id,
              id: revisionId, revisionNumber: nextRevisionNumber,
              predecessorRevisionId: predecessor.id,
              name: revisionName,
              content: dto.content,
              contentHash: revisionContentHash,
              createdByUserId,
            },
            select: publicationRevisionSelect,
          });
          const completedManifest = completeManifest(dto.snapshotManifest, {
            resourceType: "world-definition-revision",
            sourceId: revision.id,
            sourceRevision: revision.revisionNumber,
            payload: dto.content,
          });
          const snapshot = await transaction.worldDefinitionSnapshot.create({
            // The authoritative revision content is always part of its capture;
            // callers only supply the additional resolved dependency records.
            data: {
              worldDefinitionId: world.id,
              worldDefinitionRevisionId: revision.id,
              manifest: completedManifest,
              contentHash: completedManifest.contentHash,
            },
            select: publicationSnapshotSelect,
          });
          const advanced = await transaction.worldDefinition.updateMany({
            where: {
              id: world.id,
              currentRevisionId: predecessor.id,
            },
            data: { currentRevisionId: revision.id, updatedAt: new Date() },
          });
          if (advanced.count !== 1) throw stalePredecessor();

          return {
            worldDefinitionId: world.id,
            id: revision.id,
            revisionNumber: revision.revisionNumber,
            predecessorRevisionId: predecessor.id,
            name: revision.name,
            contentHash: revision.contentHash,
            publishedAt: revision.publishedAt.toISOString(),
            snapshot: snapshotResponse(snapshot),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )) as Record<string, unknown>;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (isConcurrentPublicationFailure(error)) throw stalePredecessor();
      this.unavailable();
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException(
      "World Definitions are temporarily unavailable.",
    );
  }
}

const publicationRevisionSelect = {
  id: true,
  revisionNumber: true,
  name: true,
  contentHash: true,
  publishedAt: true,
} as const;

const publicationSnapshotSelect = {
  id: true,
  contentHash: true,
  capturedAt: true,
} as const;

function createdWorldResponse(
  world: CreatedWorldDefinitionRow,
  revision: CreatedWorldRevisionRow,
  snapshot: CreatedWorldSnapshotRow,
) {
  return {
    id: world.id,
    name: world.name,
    description: world.description ?? undefined,
    status: world.status.toLowerCase(),
    createdAt: world.createdAt.toISOString(),
    currentRevision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      predecessorRevisionId: undefined,
      name: revision.name,
      contentHash: revision.contentHash,
      publishedAt: revision.publishedAt.toISOString(),
      snapshot: snapshotResponse(snapshot),
    },
  };
}

function snapshotResponse(snapshot: CreatedWorldSnapshotRow) {
  return {
    id: snapshot.id,
    contentHash: snapshot.contentHash,
    capturedAt: snapshot.capturedAt.toISOString(),
  };
}

function assertCompletePublication(content: unknown, manifest: unknown): void {
  if (!isObject(content) || !isPublicationJson(content)) {
    throw new BadRequestException(
      "Complete World revision content must be a bounded JSON object.",
    );
  }
  if (
    !isObject(manifest) ||
    !Number.isInteger(manifest.formatVersion) ||
    Number(manifest.formatVersion) < 1 ||
    !Array.isArray(manifest.records) ||
    manifest.records.length === 0 ||
    !manifest.records.every(isCompleteSnapshotRecord)
  ) {
    throw new BadRequestException(
      "A complete World snapshot manifest with at least one record is required.",
    );
  }
}

function isCompleteSnapshotRecord(value: unknown): boolean {
  return (
    isObject(value) &&
    isVisible(value.resourceType) &&
    isVisible(value.sourceId) &&
    (value.sourceRevision === undefined ||
      (Number.isInteger(value.sourceRevision) &&
        Number(value.sourceRevision) >= 1)) &&
    Object.hasOwn(value, "payload") &&
    value.payload !== undefined &&
    isPublicationJson(value.payload)
  );
}

function completeManifest(
  manifest: PublishWorldDefinitionRevisionDto["snapshotManifest"],
  authoritativeRevision: SnapshotRecordInput,
) {
  return buildSnapshotManifest(manifest.formatVersion, [
    authoritativeRevision,
    ...manifest.records,
  ]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isVisible(value: unknown): value is string {
  return typeof value === "string" && /\S/.test(value);
}

function visible(value: unknown, message: string): string {
  if (!isVisible(value)) throw new BadRequestException(message);
  return value.trim();
}

function stalePredecessor(): ConflictException {
  return new ConflictException(
    "The selected predecessor is not the current revision of this World Definition.",
  );
}

function isConcurrentPublicationFailure(error: unknown): boolean {
  if (!isObject(error)) return false;
  return error.code === "P2002" || error.code === "P2034";
}

function iso(value: Date | null): string | undefined {
  return value?.toISOString();
}
