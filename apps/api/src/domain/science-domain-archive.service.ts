import { Injectable } from "@nestjs/common";
import { Prisma, type DomainRecord } from "@prisma/client";
import { GraphService } from "../graph/graph.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  createScienceDomainArchive,
  readScienceDomainArchive,
  type ScienceDomainArchive,
  type ScienceDomainArchiveException,
  type ScienceDomainArchiveRecord,
} from "./science-domain-archive";
import {
  isObject,
  readResourceMetadata,
  type DomainResource,
} from "./domain-resource";
import { DomainService } from "./domain.service";

export interface ScienceDomainArchiveImportOptions {
  readonly apply: boolean;
}

export interface ScienceDomainArchiveImportFailure {
  readonly resource: DomainResource;
  readonly name: string;
  readonly reason: string;
}

export interface ScienceDomainArchiveImportReport {
  readonly mode: "dry-run" | "apply";
  readonly archiveCreatedAt: string;
  readonly scanned: number;
  readonly toCreate: number;
  readonly toUpdate: number;
  readonly unchanged: number;
  readonly created: number;
  readonly updated: number;
  readonly graphProjectionsRebuilt: number;
  readonly failures: readonly ScienceDomainArchiveImportFailure[];
  readonly exceptions: readonly ScienceDomainArchiveException[];
}

/** Historical DomainRecord storage restore only. Never publishes World revisions or
 * mutates Campaign Instance state. Retained for CLI science archive imports until
 * a lossless replacement preserves all sparse/retired/private authored content.
 * Archive codec + metadata checks apply equally to preflight and apply; active
 * authoring and runtime mutation use dedicated owner-backed services.
 */
@Injectable()
export class ScienceDomainArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: DomainService,
    private readonly graph: GraphService,
  ) {}

  async export(): Promise<ScienceDomainArchive> {
    const records = await this.prisma.domainRecord.findMany({
      orderBy: [{ resource: "asc" }, { id: "asc" }],
    });
    return createScienceDomainArchive(
      records.map((record, index) => {
        if (!isObject(record.data)) {
          throw new Error(
            `Stored domain record ${index + 1} is not an object and cannot be archived.`,
          );
        }
        return { resource: record.resource, data: record.data };
      }),
    );
  }

  async import(
    value: unknown,
    options: ScienceDomainArchiveImportOptions,
  ): Promise<ScienceDomainArchiveImportReport> {
    const archive = readScienceDomainArchive(value);
    const report = {
      mode: options.apply ? ("apply" as const) : ("dry-run" as const),
      archiveCreatedAt: archive.createdAt,
      scanned: 0,
      toCreate: 0,
      toUpdate: 0,
      unchanged: 0,
      created: 0,
      updated: 0,
      graphProjectionsRebuilt: 0,
      failures: [] as ScienceDomainArchiveImportFailure[],
      exceptions: archive.exceptions,
    };

    for (const record of archive.records) {
      await this.importRecord(record, options.apply, report);
    }
    return report;
  }

  private async importRecord(
    record: ScienceDomainArchiveRecord,
    apply: boolean,
    report: {
      scanned: number;
      toCreate: number;
      toUpdate: number;
      unchanged: number;
      created: number;
      updated: number;
      graphProjectionsRebuilt: number;
      failures: ScienceDomainArchiveImportFailure[];
    },
  ): Promise<void> {
    report.scanned += 1;
    const metadata = readResourceMetadata(record.resource, record.data);
    const name = this.humanName(record.resource, record.data, metadata.name);
    let existing: DomainRecord | null;
    try {
      existing = await this.prisma.domainRecord.findUnique({
        where: {
          resource_id: { resource: record.resource, id: metadata.id },
        },
      });
    } catch {
      report.failures.push({
        resource: record.resource,
        name,
        reason: "The existing record could not be checked.",
      });
      return;
    }

    if (!existing) {
      if (!this.canWrite(record, name, report)) return;
      report.toCreate += 1;
      if (!apply) return;
      try {
        {
          await this.prisma.domainRecord.create({
            data: {
              resource: record.resource,
              ...metadata,
              data: record.data as Prisma.InputJsonObject,
            },
          });
          await this.graph.addDomainResource(
            record.resource,
            metadata.id,
            record.data,
            metadata.kind,
            metadata.name,
          );
        }
        report.created += 1;
        report.graphProjectionsRebuilt += 1;
      } catch {
        report.failures.push({
          resource: record.resource,
          name,
          reason:
            "The record or its graph projection could not be created. Run the import again after resolving persistence health.",
        });
      }
      return;
    }

    if (!isObject(existing.data)) {
      report.failures.push({
        resource: record.resource,
        name,
        reason: "The stored aggregate is not an object and was not replaced.",
      });
      return;
    }
    if (canonicalJson(existing.data) === canonicalJson(record.data)) {
      report.unchanged += 1;
      if (apply) {
        try {
          await this.graph.replaceDomainResource(
            record.resource,
            metadata.id,
            existing.data,
            record.data,
            existing.kind ?? undefined,
            existing.name ?? undefined,
            metadata.kind,
            metadata.name,
          );
          report.graphProjectionsRebuilt += 1;
        } catch {
          report.failures.push({
            resource: record.resource,
            name,
            reason:
              "The unchanged record's graph projection could not be rebuilt. Run the import again after resolving persistence health.",
          });
        }
      }
      return;
    }

    if (!this.canWrite(record, name, report)) return;
    report.toUpdate += 1;
    if (!apply) return;
    try {
      {
        const result = await this.prisma.domainRecord.updateMany({
          where: {
            resource: record.resource,
            id: metadata.id,
            revision: existing.revision,
          },
          data: {
            ...metadata,
            data: record.data as Prisma.InputJsonObject,
            revision: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new Error("Archive revision conflict.");
        await this.graph.replaceDomainResource(
          record.resource,
          metadata.id,
          existing.data,
          record.data,
          existing.kind ?? undefined,
          existing.name ?? undefined,
          metadata.kind,
          metadata.name,
        );
      }
      report.updated += 1;
      report.graphProjectionsRebuilt += 1;
    } catch {
      report.failures.push({
        resource: record.resource,
        name,
        reason:
          "The record changed or its graph projection could not be rebuilt. Stop writes and run the import again.",
      });
    }
  }

  private canWrite(
    record: ScienceDomainArchiveRecord,
    name: string,
    report: { failures: ScienceDomainArchiveImportFailure[] },
  ): boolean {
    try {
      // Historical runtime storage is deliberately outside live owner mutation.
      // Archive decoding and metadata validation retain old/private fields losslessly;
      // only scoped Instance workflows may realize these records into active state.
      this.domain.assertHistoricalArchivePayload(record.resource, record.data);
      return true;
    } catch {
      report.failures.push({
        resource: record.resource,
        name,
        reason:
          "The historical record has invalid archive metadata and was not restored. Retain the archive for repair.",
      });
      return false;
    }
  }

  private humanName(
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
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}
