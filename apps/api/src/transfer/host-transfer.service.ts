import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { GraphService } from "../graph/graph.service";
import { ObjectStorageService } from "../media/object-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { isObject, readResourceMetadata } from "../domain/domain-resource";
import {
  type ArchivedDomainRecord,
  type ArchivedMediaAsset,
  type ConflictStrategy,
  type HostTransferManifest,
  type TransferSelection,
  HOST_TRANSFER_ARCHIVE_SCHEMA,
  HOST_TRANSFER_ARCHIVE_VERSION,
  parseManifest,
  remapRecordIdentities,
  selectDomainRecords,
  sha256File,
  verifyHostTransferArchive,
} from "./host-transfer-archive";

export interface HostTransferImportOptions {
  readonly apply: boolean;
  readonly conflicts: ConflictStrategy;
}

export interface HostTransferImportReport {
  readonly mode: "dry-run" | "apply";
  readonly conflicts: ConflictStrategy;
  readonly domainRecords: number;
  readonly mediaAssets: number;
  readonly storageObjects: number;
  readonly conflictingDomainRecords: number;
  readonly conflictingMediaAssets: number;
  readonly createdDomainRecords: number;
  readonly replacedDomainRecords: number;
  readonly skippedDomainRecords: number;
  readonly createdMediaAssets: number;
  readonly replacedMediaAssets: number;
  readonly skippedMediaAssets: number;
  graphProjectionsRebuilt: number;
}

@Injectable()
export class HostTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly graph: GraphService,
  ) {}

  async exportToDirectory(
    directory: string,
    selection: TransferSelection,
  ): Promise<HostTransferManifest> {
    await mkdir(join(directory, "storage"), { recursive: true });
    const [rawRecords, rawMedia] = await this.prisma.$transaction(
      [
        this.prisma.domainRecord.findMany({
          orderBy: [{ resource: "asc" }, { id: "asc" }],
        }),
        this.prisma.mediaAsset.findMany({ orderBy: { objectKey: "asc" } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const records = selectDomainRecords(
      rawRecords.map((record) => {
        if (!isObject(record.data)) {
          throw new BadRequestException(
            "A stored aggregate is not an object and cannot be transferred.",
          );
        }
        return {
          ...record,
          resource: record.resource as ArchivedDomainRecord["resource"],
          data: record.data,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      }),
      selection,
    );
    const media = rawMedia.map(
      (asset) =>
        ({
          ...asset,
          createdAt: asset.createdAt.toISOString(),
          updatedAt: asset.updatedAt.toISOString(),
        }) satisfies ArchivedMediaAsset,
    );

    await writeJson(join(directory, "domain-records.json"), records);
    await writeJson(join(directory, "media-assets.json"), media);
    const schemaSource = await findPrismaSchema();
    await copyFile(schemaSource, join(directory, "schema.prisma"));

    const objects = [];
    for (const object of await this.storage.listObjects()) {
      const path = storagePath(directory, object.objectKey);
      await mkdir(dirname(path), { recursive: true });
      await pipeline(
        await this.storage.downloadObject(object.objectKey),
        createWriteStream(path, { flags: "wx" }),
      );
      objects.push({
        objectKey: object.objectKey,
        size: (await stat(path)).size,
        sha256: await sha256File(path),
      });
    }

    const manifest: HostTransferManifest = {
      schema: HOST_TRANSFER_ARCHIVE_SCHEMA,
      version: HOST_TRANSFER_ARCHIVE_VERSION,
      createdAt: new Date().toISOString(),
      selection,
      database: {
        prismaSchema: "schema.prisma",
        prismaSchemaSha256: await sha256File(join(directory, "schema.prisma")),
        records: "domain-records.json",
        recordsSha256: await sha256File(join(directory, "domain-records.json")),
        mediaMetadata: "media-assets.json",
        mediaMetadataSha256: await sha256File(
          join(directory, "media-assets.json"),
        ),
        schemaUpgrade: "prisma-db-push",
      },
      storage: { directory: "storage", objects },
    };
    await writeJson(join(directory, "manifest.json"), manifest);
    return manifest;
  }

  async importFromDirectory(
    directory: string,
    options: HostTransferImportOptions,
  ): Promise<HostTransferImportReport> {
    const manifest = parseManifest(
      JSON.parse(
        await readFile(join(directory, "manifest.json"), "utf8"),
      ) as unknown,
    );
    await verifyHostTransferArchive(directory, manifest);
    let records = parseArray<ArchivedDomainRecord>(
      await readFile(join(directory, manifest.database.records), "utf8"),
    );
    let media = parseArray<ArchivedMediaAsset>(
      await readFile(join(directory, manifest.database.mediaMetadata), "utf8"),
    );
    for (const record of records)
      readResourceMetadata(record.resource, record.data);

    const existingRecords = records.length
      ? await this.prisma.domainRecord.findMany({
          where: { OR: records.map(({ resource, id }) => ({ resource, id })) },
        })
      : [];
    const existingMedia = media.length
      ? await this.prisma.mediaAsset.findMany({
          where: {
            OR: media.flatMap(({ id, objectKey }) => [{ id }, { objectKey }]),
          },
        })
      : [];
    const existingStorageKeys = new Set(
      (await this.storage.listObjects()).map(({ objectKey }) => objectKey),
    );
    const recordConflictKeys = new Set(
      existingRecords.map(({ resource, id }) => `${resource}\0${id}`),
    );
    const recordConflictIds = new Set(
      records
        .filter(({ resource, id }) =>
          recordConflictKeys.has(`${resource}\0${id}`),
        )
        .map(({ id }) => id),
    );
    const mediaConflictIds = new Set(
      media
        .filter(({ id, objectKey }) =>
          existingMedia.some(
            (existing) =>
              existing.id === id || existing.objectKey === objectKey,
          ),
        )
        .map(({ id }) => id),
    );
    const mediaObjectConflicts = new Set(
      manifest.storage.objects
        .map(({ objectKey }) => objectKey)
        .filter((key) => existingStorageKeys.has(key)),
    );
    const originalMedia = media;
    if (options.conflicts === "both") {
      const remapped = remapRecordIdentities(
        records,
        media,
        recordConflictIds,
        mediaConflictIds,
      );
      records = remapped.records;
      media = remapped.media;
    }
    media = media.map((asset) => ({
      ...asset,
      bucket: this.storage.bucketName(),
    }));

    const report: HostTransferImportReport = {
      mode: options.apply ? "apply" : "dry-run",
      conflicts: options.conflicts,
      domainRecords: records.length,
      mediaAssets: media.length,
      storageObjects: manifest.storage.objects.length,
      conflictingDomainRecords: recordConflictKeys.size,
      conflictingMediaAssets: mediaConflictIds.size,
      createdDomainRecords:
        options.conflicts === "both"
          ? records.length
          : records.length - recordConflictKeys.size,
      replacedDomainRecords:
        options.conflicts === "theirs" ? recordConflictKeys.size : 0,
      skippedDomainRecords:
        options.conflicts === "ours" ? recordConflictKeys.size : 0,
      createdMediaAssets:
        options.conflicts === "both"
          ? media.length
          : media.length - mediaConflictIds.size,
      replacedMediaAssets:
        options.conflicts === "theirs" ? mediaConflictIds.size : 0,
      skippedMediaAssets:
        options.conflicts === "ours" ? mediaConflictIds.size : 0,
      graphProjectionsRebuilt: 0,
    };
    if (!options.apply) return report;

    const mediaTargets = new Map(
      originalMedia.map((source, index) => [
        source.objectKey,
        media[index]?.objectKey ?? source.objectKey,
      ]),
    );
    const uploaded: string[] = [];
    const rollbackObjects = new Map<string, string>();
    try {
      for (const object of manifest.storage.objects) {
        const conflict = mediaObjectConflicts.has(object.objectKey);
        if (conflict && options.conflicts === "ours") continue;
        const target =
          options.conflicts === "both" && conflict
            ? (mediaTargets.get(object.objectKey) ??
              `imports/${cryptoId()}/${basename(object.objectKey)}`)
            : (mediaTargets.get(object.objectKey) ?? object.objectKey);
        if (conflict && target === object.objectKey) {
          const rollbackPath = join(directory, "rollback", object.objectKey);
          await mkdir(dirname(rollbackPath), { recursive: true });
          await pipeline(
            await this.storage.downloadObject(object.objectKey),
            createWriteStream(rollbackPath, { flags: "wx" }),
          );
          rollbackObjects.set(object.objectKey, rollbackPath);
        }
        const metadata = media.find(({ objectKey }) => objectKey === target);
        await this.storage.putObject(
          target,
          createReadStream(storagePath(directory, object.objectKey)),
          metadata,
        );
        uploaded.push(target);
      }

      await this.prisma.$transaction(async (transaction) => {
        for (const record of records) {
          const wasConflict = recordConflictKeys.has(
            `${record.resource}\0${record.id}`,
          );
          if (wasConflict && options.conflicts === "ours") continue;
          await transaction.domainRecord.upsert({
            where: {
              resource_id: { resource: record.resource, id: record.id },
            },
            create: domainCreate(record),
            update: domainUpdate(record),
          });
        }
        for (const asset of media) {
          const wasConflict =
            mediaConflictIds.has(asset.id) ||
            mediaObjectConflicts.has(asset.objectKey);
          if (wasConflict && options.conflicts === "ours") continue;
          if (options.conflicts === "theirs") {
            await transaction.mediaAsset.deleteMany({
              where: { objectKey: asset.objectKey, id: { not: asset.id } },
            });
          }
          await transaction.mediaAsset.upsert({
            where: { id: asset.id },
            create: mediaCreate(asset),
            update: mediaUpdate(asset),
          });
        }
      });
    } catch (error) {
      await Promise.allSettled(
        uploaded.map(async (key) => {
          const rollbackPath = rollbackObjects.get(key);
          if (rollbackPath) {
            const metadata = existingMedia.find(
              (asset) => asset.objectKey === key,
            );
            await this.storage.putObject(
              key,
              createReadStream(rollbackPath),
              metadata,
            );
          } else {
            await this.storage.delete(key);
          }
        }),
      );
      throw error;
    }

    const previousRecords = new Map(
      existingRecords.map((record) => [
        `${record.resource}\0${record.id}`,
        record,
      ]),
    );
    try {
      for (const record of records) {
        const previous = previousRecords.get(
          `${record.resource}\0${record.id}`,
        );
        if (options.conflicts === "ours" && previous) continue;
        if (previous && isObject(previous.data)) {
          await this.graph.replaceDomainResource(
            record.resource,
            record.id,
            previous.data,
            record.data,
            previous.kind ?? undefined,
            previous.name ?? undefined,
            record.kind ?? undefined,
            record.name ?? undefined,
          );
        } else {
          await this.graph.addDomainResource(
            record.resource,
            record.id,
            record.data,
            record.kind ?? undefined,
            record.name ?? undefined,
          );
        }
        report.graphProjectionsRebuilt += 1;
      }
    } catch (error) {
      await this.rollbackDatabase(
        records,
        media,
        existingRecords,
        existingMedia,
        options.conflicts,
      );
      await Promise.allSettled(
        records.map(async (record) => {
          const previous = previousRecords.get(
            `${record.resource}\0${record.id}`,
          );
          if (options.conflicts === "ours" && previous) return;
          if (previous && isObject(previous.data)) {
            await this.graph.replaceDomainResource(
              record.resource,
              record.id,
              record.data,
              previous.data,
              record.kind ?? undefined,
              record.name ?? undefined,
              previous.kind ?? undefined,
              previous.name ?? undefined,
            );
          } else {
            await this.graph.removeDomainResource(
              record.resource,
              record.id,
              record.data,
              record.kind ?? undefined,
              record.name ?? undefined,
            );
          }
        }),
      );
      await Promise.allSettled(
        uploaded.map(async (key) => {
          const rollbackPath = rollbackObjects.get(key);
          const metadata = existingMedia.find(
            (asset) => asset.objectKey === key,
          );
          if (rollbackPath) {
            await this.storage.putObject(
              key,
              createReadStream(rollbackPath),
              metadata,
            );
          } else {
            await this.storage.delete(key);
          }
        }),
      );
      throw error;
    }
    return report;
  }

  private async rollbackDatabase(
    records: readonly ArchivedDomainRecord[],
    media: readonly ArchivedMediaAsset[],
    existingRecords: Awaited<
      ReturnType<PrismaService["domainRecord"]["findMany"]>
    >,
    existingMedia: Awaited<ReturnType<PrismaService["mediaAsset"]["findMany"]>>,
    conflicts: ConflictStrategy,
  ): Promise<void> {
    const previousRecords = new Map(
      existingRecords.map((record) => [
        `${record.resource}\0${record.id}`,
        record,
      ]),
    );
    await this.prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const previous = previousRecords.get(
          `${record.resource}\0${record.id}`,
        );
        if (conflicts === "ours" && previous) continue;
        await transaction.domainRecord.deleteMany({
          where: { resource: record.resource, id: record.id },
        });
        if (previous) {
          await transaction.domainRecord.create({
            data: {
              ...previous,
              data: previous.data as Prisma.InputJsonValue,
            },
          });
        }
      }
      for (const asset of media) {
        const wasExisting = existingMedia.some(
          (previous) =>
            previous.id === asset.id || previous.objectKey === asset.objectKey,
        );
        if (conflicts === "ours" && wasExisting) continue;
        await transaction.mediaAsset.deleteMany({ where: { id: asset.id } });
      }
      for (const previous of existingMedia) {
        await transaction.mediaAsset.deleteMany({
          where: { objectKey: previous.objectKey, id: { not: previous.id } },
        });
        await transaction.mediaAsset.upsert({
          where: { id: previous.id },
          create: previous,
          update: previous,
        });
      }
    });
  }
}

function storagePath(directory: string, objectKey: string): string {
  const path = resolve(directory, "storage", objectKey);
  const root = `${resolve(directory, "storage")}/`;
  if (!path.startsWith(root)) {
    throw new BadRequestException(
      "A storage object key escapes the archive directory.",
    );
  }
  return path;
}

async function findPrismaSchema(): Promise<string> {
  const candidates = [
    resolve(process.cwd(), "apps/api/prisma/schema.prisma"),
    resolve(process.cwd(), "prisma/schema.prisma"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported working directory.
    }
  }
  throw new Error("The Prisma schema could not be located.");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function parseArray<T>(source: Buffer | string): T[] {
  const value: unknown = JSON.parse(source.toString());
  if (!Array.isArray(value))
    throw new BadRequestException("An archive data file is invalid.");
  return value as T[];
}

function domainCreate(
  record: ArchivedDomainRecord,
): Prisma.DomainRecordCreateInput {
  return {
    resource: record.resource,
    id: record.id,
    kind: record.kind,
    name: record.name,
    data: record.data as Prisma.InputJsonObject,
    revision: record.revision,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function domainUpdate(
  record: ArchivedDomainRecord,
): Prisma.DomainRecordUpdateInput {
  return domainCreate(record);
}

function mediaCreate(asset: ArchivedMediaAsset): Prisma.MediaAssetCreateInput {
  return {
    ...asset,
    tags: [...asset.tags],
    createdAt: new Date(asset.createdAt),
    updatedAt: new Date(asset.updatedAt),
  };
}

function mediaUpdate(asset: ArchivedMediaAsset): Prisma.MediaAssetUpdateInput {
  return mediaCreate(asset);
}

function cryptoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
