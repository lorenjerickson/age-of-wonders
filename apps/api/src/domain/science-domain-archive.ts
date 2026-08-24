import { BadRequestException } from "@nestjs/common";
import {
  assertDomainResource,
  isObject,
  readResourceMetadata,
  type DomainResource,
} from "./domain-resource";
import {
  migrateScienceDomainData,
  SCIENCE_DOMAIN_MIGRATION_VERSION,
} from "./science-domain-migration";

export const SCIENCE_DOMAIN_ARCHIVE_SCHEMA = "aow:science-domain-archive";
export const SCIENCE_DOMAIN_ARCHIVE_VERSION = 1;

export interface ScienceDomainArchiveRecord {
  readonly resource: DomainResource;
  readonly data: Record<string, unknown>;
}

export interface ScienceDomainArchiveException {
  readonly resource: DomainResource;
  readonly name: string;
  readonly kind?: string;
  readonly messages: readonly string[];
}

export interface ScienceDomainArchive {
  readonly schema: typeof SCIENCE_DOMAIN_ARCHIVE_SCHEMA;
  readonly version: typeof SCIENCE_DOMAIN_ARCHIVE_VERSION;
  readonly domainMigrationVersion: string;
  readonly createdAt: string;
  readonly records: readonly ScienceDomainArchiveRecord[];
  readonly exceptions: readonly ScienceDomainArchiveException[];
}

interface ArchiveInputRecord {
  readonly resource: string;
  readonly data: unknown;
}

export function createScienceDomainArchive(
  records: readonly ArchiveInputRecord[],
  createdAt = new Date().toISOString(),
): ScienceDomainArchive {
  const normalized = records.map((record, index) =>
    normalizeArchiveRecord(record, index),
  );
  const seen = new Set<string>();
  for (const record of normalized) {
    const metadata = readResourceMetadata(record.resource, record.data);
    const key = `${record.resource}\0${metadata.id}`;
    if (seen.has(key)) {
      throw new BadRequestException(
        "The archive contains two records with the same canonical identity.",
      );
    }
    seen.add(key);
  }
  normalized.sort((left, right) => {
    const resourceOrder = left.resource.localeCompare(right.resource);
    if (resourceOrder !== 0) return resourceOrder;
    const leftId = readResourceMetadata(left.resource, left.data).id;
    const rightId = readResourceMetadata(right.resource, right.data).id;
    return leftId.localeCompare(rightId);
  });

  return {
    schema: SCIENCE_DOMAIN_ARCHIVE_SCHEMA,
    version: SCIENCE_DOMAIN_ARCHIVE_VERSION,
    domainMigrationVersion: SCIENCE_DOMAIN_MIGRATION_VERSION,
    createdAt,
    records: normalized,
    exceptions: normalized.flatMap(exceptionReportsForRecord),
  };
}

export function readScienceDomainArchive(value: unknown): ScienceDomainArchive {
  if (!isObject(value)) {
    throw new BadRequestException("The domain archive must be a JSON object.");
  }
  if (value.schema !== SCIENCE_DOMAIN_ARCHIVE_SCHEMA) {
    throw new BadRequestException(
      "The domain archive schema is not supported.",
    );
  }
  if (value.version !== SCIENCE_DOMAIN_ARCHIVE_VERSION) {
    throw new BadRequestException(
      "The domain archive version is not supported.",
    );
  }
  if (typeof value.createdAt !== "string" || !value.createdAt.trim()) {
    throw new BadRequestException(
      "The domain archive requires a creation timestamp.",
    );
  }
  if (!Array.isArray(value.records)) {
    throw new BadRequestException(
      "The domain archive requires a records array.",
    );
  }
  const records = (value.records as readonly unknown[]).map((record, index) => {
    if (!isObject(record)) {
      throw new BadRequestException(
        `Archive record ${index + 1} must be an object.`,
      );
    }
    if (typeof record.resource !== "string") {
      throw new BadRequestException(
        `Archive record ${index + 1} requires a resource category.`,
      );
    }
    return { resource: record.resource, data: record.data };
  });
  return createScienceDomainArchive(records, value.createdAt);
}

function normalizeArchiveRecord(
  record: ArchiveInputRecord,
  index: number,
): ScienceDomainArchiveRecord {
  let resource: DomainResource;
  try {
    resource = assertDomainResource(record.resource);
  } catch {
    throw new BadRequestException(
      `Archive record ${index + 1} uses an unsupported resource category.`,
    );
  }
  if (!isObject(record.data)) {
    throw new BadRequestException(
      `Archive record ${index + 1} must contain an object aggregate.`,
    );
  }
  const data = migrateScienceDomainData(resource, record.data).data;
  try {
    readResourceMetadata(resource, data);
  } catch {
    throw new BadRequestException(
      `Archive record ${index + 1} lacks the metadata required for import.`,
    );
  }
  return { resource, data };
}

function exceptionReportsForRecord(
  record: ScienceDomainArchiveRecord,
): readonly ScienceDomainArchiveException[] {
  const extensions = isObject(record.data.extensions)
    ? record.data.extensions
    : {};
  const stored = extensions["aow:science-refactor-exceptions"];
  const messages = Array.isArray(stored)
    ? (stored as readonly unknown[]).filter(
        (message): message is string => typeof message === "string",
      )
    : [];
  if (messages.length === 0) return [];
  const metadata = readResourceMetadata(record.resource, record.data);
  return [
    {
      resource: record.resource,
      name: humanName(record.resource, record.data, metadata.name),
      kind: metadata.kind,
      messages,
    },
  ];
}

function humanName(
  resource: DomainResource,
  data: Record<string, unknown>,
  metadataName?: string,
): string {
  if (resource === "items") {
    return typeof data.nameOverride === "string" && data.nameOverride.trim()
      ? data.nameOverride.trim()
      : "Unnamed item instance";
  }
  return (
    metadataName?.trim() || `Unnamed ${resource.replaceAll("-", " ")} record`
  );
}
