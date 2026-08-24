import { BadRequestException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isObject, type DomainResource } from "../domain/domain-resource";

export const HOST_TRANSFER_ARCHIVE_SCHEMA = "aow:host-transfer-archive";
export const HOST_TRANSFER_ARCHIVE_VERSION = 1;

export type ConflictStrategy = "ours" | "theirs" | "both";

export interface TransferSelection {
  readonly worldIds: readonly string[];
  readonly campaignIds: readonly string[];
  readonly sessionIds: readonly string[];
}

export interface ArchivedDomainRecord {
  readonly resource: DomainResource;
  readonly id: string;
  readonly kind: string | null;
  readonly name: string | null;
  readonly data: Record<string, unknown>;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ArchivedMediaAsset {
  readonly id: string;
  readonly bucket: string;
  readonly objectKey: string;
  readonly filename: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly mediaType: string;
  readonly purpose: string;
  readonly size: number;
  readonly etag: string | null;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ArchivedStorageObject {
  readonly objectKey: string;
  readonly size: number;
  readonly sha256: string;
}

export interface HostTransferManifest {
  readonly schema: typeof HOST_TRANSFER_ARCHIVE_SCHEMA;
  readonly version: typeof HOST_TRANSFER_ARCHIVE_VERSION;
  readonly createdAt: string;
  readonly selection: TransferSelection;
  readonly database: {
    readonly prismaSchema: "schema.prisma";
    readonly prismaSchemaSha256: string;
    readonly records: "domain-records.json";
    readonly recordsSha256: string;
    readonly mediaMetadata: "media-assets.json";
    readonly mediaMetadataSha256: string;
    readonly schemaUpgrade: "prisma-db-push";
  };
  readonly storage: {
    readonly directory: "storage";
    readonly objects: readonly ArchivedStorageObject[];
  };
}

export function emptySelection(selection: TransferSelection): boolean {
  return (
    selection.worldIds.length === 0 &&
    selection.campaignIds.length === 0 &&
    selection.sessionIds.length === 0
  );
}

/**
 * Select roots, owned records, descendants, and forward references. This keeps
 * a selected aggregate usable on another host without pulling unrelated roots.
 */
export function selectDomainRecords(
  records: readonly ArchivedDomainRecord[],
  selection: TransferSelection,
): ArchivedDomainRecord[] {
  if (emptySelection(selection)) return [...records];
  const selected = new Set<string>();
  const requestedRoots = [
    ...selection.worldIds.map((id) => `locations\0${id}`),
    ...selection.campaignIds.map((id) => `campaigns\0${id}`),
    ...selection.sessionIds.map((id) => `sessions\0${id}`),
  ];
  const byId = new Map<string, ArchivedDomainRecord[]>();
  for (const record of records) {
    const matches = byId.get(record.id) ?? [];
    matches.push(record);
    byId.set(record.id, matches);
  }
  const add = (record: ArchivedDomainRecord): boolean => {
    const key = `${record.resource}\0${record.id}`;
    if (selected.has(key)) return false;
    selected.add(key);
    return true;
  };

  for (const record of records) {
    if (
      (record.resource === "locations" &&
        selection.worldIds.includes(record.id) &&
        record.kind === "world") ||
      (record.resource === "campaigns" &&
        selection.campaignIds.includes(record.id)) ||
      (record.resource === "sessions" &&
        selection.sessionIds.includes(record.id))
    ) {
      add(record);
    }
  }
  for (const requested of requestedRoots) {
    if (!selected.has(requested)) {
      throw new BadRequestException(
        "A selected world, campaign, or session could not be found.",
      );
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const selectedIds = new Set(
      [...selected].map((key) => key.slice(key.indexOf("\0") + 1)),
    );
    for (const record of records) {
      const key = `${record.resource}\0${record.id}`;
      if (selected.has(key)) {
        for (const reference of collectReferences(record.data)) {
          for (const dependency of byId.get(reference) ?? []) {
            changed = add(dependency) || changed;
          }
        }
        continue;
      }
      if (referencesAnyOwner(record.data, selectedIds)) {
        changed = add(record) || changed;
      }
    }
  }
  return records.filter((record) =>
    selected.has(`${record.resource}\0${record.id}`),
  );
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}

export async function verifyHostTransferArchive(
  directory: string,
  manifest: HostTransferManifest,
): Promise<void> {
  const checks: readonly [string, string, string][] = [
    [
      manifest.database.prismaSchema,
      manifest.database.prismaSchemaSha256,
      "database schema",
    ],
    [
      manifest.database.records,
      manifest.database.recordsSha256,
      "domain record",
    ],
    [
      manifest.database.mediaMetadata,
      manifest.database.mediaMetadataSha256,
      "media metadata",
    ],
  ];
  for (const [relativePath, expected, label] of checks) {
    if ((await sha256File(join(directory, relativePath))) !== expected) {
      throw new BadRequestException(`The archived ${label} checksum failed.`);
    }
  }
  for (const object of manifest.storage.objects) {
    const path = archiveStoragePath(directory, object.objectKey);
    if (
      (await stat(path)).size !== object.size ||
      (await sha256File(path)) !== object.sha256
    ) {
      throw new BadRequestException(
        "An archived storage object checksum failed.",
      );
    }
  }
}

export function parseManifest(value: unknown): HostTransferManifest {
  if (!isObject(value))
    throw new BadRequestException("Invalid archive manifest.");
  if (
    value.schema !== HOST_TRANSFER_ARCHIVE_SCHEMA ||
    value.version !== HOST_TRANSFER_ARCHIVE_VERSION
  ) {
    throw new BadRequestException("Unsupported host-transfer archive version.");
  }
  if (!isObject(value.database) || !isObject(value.storage)) {
    throw new BadRequestException("The archive manifest is incomplete.");
  }
  if (!Array.isArray(value.storage.objects)) {
    throw new BadRequestException("The storage object manifest is missing.");
  }
  if (
    value.database.prismaSchema !== "schema.prisma" ||
    value.database.records !== "domain-records.json" ||
    value.database.mediaMetadata !== "media-assets.json" ||
    value.database.schemaUpgrade !== "prisma-db-push" ||
    !isSha256(value.database.prismaSchemaSha256) ||
    !isSha256(value.database.recordsSha256) ||
    !isSha256(value.database.mediaMetadataSha256)
  ) {
    throw new BadRequestException("The archive database manifest is invalid.");
  }
  for (const object of value.storage.objects) {
    if (
      !isObject(object) ||
      typeof object.objectKey !== "string" ||
      !object.objectKey ||
      typeof object.size !== "number" ||
      object.size < 0 ||
      !isSha256(object.sha256)
    ) {
      throw new BadRequestException("The archive storage manifest is invalid.");
    }
  }
  return value as unknown as HostTransferManifest;
}

export function remapRecordIdentities(
  records: readonly ArchivedDomainRecord[],
  media: readonly ArchivedMediaAsset[],
  conflictingRecordIds: ReadonlySet<string>,
  conflictingMediaIds: ReadonlySet<string>,
): {
  records: ArchivedDomainRecord[];
  media: ArchivedMediaAsset[];
  idMap: Map<string, string>;
} {
  const idMap = new Map<string, string>();
  for (const id of conflictingRecordIds) idMap.set(id, randomUUID());
  for (const id of conflictingMediaIds) idMap.set(id, randomUUID());
  const replace = (value: unknown): unknown => {
    if (typeof value === "string") return idMap.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replace);
    if (!isObject(value)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replace(child)]),
    );
  };
  return {
    records: records.map((record) => ({
      ...record,
      id: idMap.get(record.id) ?? record.id,
      data: replace(record.data) as Record<string, unknown>,
    })),
    media: media.map((asset) => {
      const nextId = idMap.get(asset.id);
      return nextId
        ? {
            ...asset,
            id: nextId,
            objectKey: `imports/${nextId}/${asset.filename}`,
          }
        : asset;
    }),
    idMap,
  };
}

function collectReferences(value: unknown, key = ""): string[] {
  if (typeof value === "string") {
    return /(?:Id|Ids)$/.test(key) ? [value] : [];
  }
  if (Array.isArray(value))
    return value.flatMap((child) => collectReferences(child, key));
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([childKey, child]) =>
    collectReferences(child, childKey),
  );
}

function referencesAnyOwner(
  value: unknown,
  selectedIds: ReadonlySet<string>,
  key = "",
): boolean {
  if (typeof value === "string") {
    return (
      selectedIds.has(value) &&
      (/(?:world|campaign|session|parentLocation)Id$/i.test(key) ||
        key === "aow:worldId")
    );
  }
  if (Array.isArray(value)) {
    return value.some((child) => referencesAnyOwner(child, selectedIds, key));
  }
  if (!isObject(value)) return false;
  return Object.entries(value).some(([childKey, child]) =>
    referencesAnyOwner(child, selectedIds, childKey),
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function archiveStoragePath(directory: string, objectKey: string): string {
  const path = resolve(directory, "storage", objectKey);
  const root = `${resolve(directory, "storage")}/`;
  if (!path.startsWith(root)) {
    throw new BadRequestException(
      "A storage object key escapes the archive directory.",
    );
  }
  return path;
}
