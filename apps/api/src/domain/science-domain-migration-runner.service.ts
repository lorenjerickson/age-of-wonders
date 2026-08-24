import { Injectable } from "@nestjs/common";
import type { DomainRecord, Prisma } from "@prisma/client";
import { GraphService } from "../graph/graph.service";
import { PrismaService } from "../prisma/prisma.service";
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

export interface ScienceDomainMigrationRunOptions {
  readonly apply: boolean;
  readonly batchSize?: number;
}

export interface ScienceDomainMigrationExceptionReport {
  readonly resource: DomainResource;
  readonly name: string;
  readonly kind?: string;
  readonly messages: readonly string[];
}

export interface ScienceDomainMigrationFailure {
  readonly resource?: DomainResource;
  readonly name: string;
  readonly reason: string;
}

export interface ScienceDomainMigrationChangeReport {
  readonly resource: DomainResource;
  readonly name: string;
  readonly kind?: string;
}

export interface ScienceDomainMigrationRunReport {
  readonly version: string;
  readonly mode: "dry-run" | "apply";
  readonly scanned: number;
  readonly changed: number;
  readonly applied: number;
  readonly graphProjectionsRebuilt: number;
  readonly unchanged: number;
  readonly failures: readonly ScienceDomainMigrationFailure[];
  readonly exceptions: readonly ScienceDomainMigrationExceptionReport[];
  readonly changes: readonly ScienceDomainMigrationChangeReport[];
  readonly compatibilityRetirementReady: boolean;
}

interface MutableMigrationReport {
  scanned: number;
  changed: number;
  applied: number;
  graphProjectionsRebuilt: number;
  unchanged: number;
  failures: ScienceDomainMigrationFailure[];
  exceptions: ScienceDomainMigrationExceptionReport[];
  changes: ScienceDomainMigrationChangeReport[];
}

@Injectable()
export class ScienceDomainMigrationRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
  ) {}

  async run(
    options: ScienceDomainMigrationRunOptions,
  ): Promise<ScienceDomainMigrationRunReport> {
    const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500);
    const report: MutableMigrationReport = {
      scanned: 0,
      changed: 0,
      applied: 0,
      graphProjectionsRebuilt: 0,
      unchanged: 0,
      failures: [],
      exceptions: [],
      changes: [],
    };
    let cursor: { resource: string; id: string } | undefined;

    do {
      const records = await this.prisma.domainRecord.findMany({
        orderBy: [{ resource: "asc" }, { id: "asc" }],
        take: batchSize,
        ...(cursor
          ? {
              cursor: { resource_id: cursor },
              skip: 1,
            }
          : {}),
      });
      if (records.length === 0) break;

      for (const record of records) {
        await this.processRecord(record, options.apply, report);
      }
      const last = records.at(-1);
      cursor = last ? { resource: last.resource, id: last.id } : undefined;
      if (records.length < batchSize) break;
    } while (cursor);

    return {
      version: SCIENCE_DOMAIN_MIGRATION_VERSION,
      mode: options.apply ? "apply" : "dry-run",
      ...report,
      compatibilityRetirementReady:
        report.changed === 0 &&
        report.failures.length === 0 &&
        report.exceptions.length === 0,
    };
  }

  private async processRecord(
    record: DomainRecord,
    apply: boolean,
    report: MutableMigrationReport,
  ): Promise<void> {
    report.scanned += 1;
    let resource: DomainResource;
    try {
      resource = assertDomainResource(record.resource);
    } catch {
      report.failures.push({
        name: "Unrecognized domain record",
        reason: "The record uses an unsupported resource category.",
      });
      return;
    }

    if (!isObject(record.data)) {
      report.failures.push({
        resource,
        name: this.fallbackName(resource),
        reason: "The stored aggregate is not an object and was not changed.",
      });
      return;
    }

    const migration = migrateScienceDomainData(resource, record.data);
    let metadata: ReturnType<typeof readResourceMetadata>;
    try {
      metadata = readResourceMetadata(resource, migration.data);
    } catch {
      report.failures.push({
        resource,
        name: this.humanName(resource, migration.data),
        reason: "The aggregate lacks the metadata required for safe migration.",
      });
      return;
    }

    const name = this.humanName(resource, migration.data, metadata.name);
    const persistedExceptions = this.readExceptions(migration.data);
    if (persistedExceptions.length > 0) {
      report.exceptions.push({
        resource,
        name,
        kind: metadata.kind,
        messages: persistedExceptions,
      });
    }

    if (!migration.changed) {
      report.unchanged += 1;
      return;
    }
    report.changed += 1;
    report.changes.push({
      resource,
      name,
      kind: metadata.kind,
    });
    if (!apply) return;

    try {
      await this.graph.replaceDomainResource(
        resource,
        record.id,
        record.data,
        migration.data,
        record.kind ?? undefined,
        record.name ?? undefined,
        metadata.kind,
        metadata.name,
      );
      report.graphProjectionsRebuilt += 1;

      const result = await this.prisma.domainRecord.updateMany({
        where: {
          resource: record.resource,
          id: record.id,
          revision: record.revision,
        },
        data: {
          kind: metadata.kind,
          name: metadata.name,
          data: migration.data as Prisma.InputJsonObject,
          revision: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        report.failures.push({
          resource,
          name,
          reason:
            "The record changed during migration. Stop writes and run the migration again.",
        });
        return;
      }
      report.applied += 1;
    } catch {
      report.failures.push({
        resource,
        name,
        reason:
          "The record or its graph projection could not be updated. Run the migration again after resolving persistence health.",
      });
    }
  }

  private readExceptions(data: Record<string, unknown>): readonly string[] {
    const extensions = isObject(data.extensions) ? data.extensions : {};
    const exceptions = extensions["aow:science-refactor-exceptions"];
    return Array.isArray(exceptions)
      ? (exceptions as readonly unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
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
    return metadataName?.trim() || this.fallbackName(resource);
  }

  private fallbackName(resource: DomainResource): string {
    return `Unnamed ${resource.replaceAll("-", " ")} record`;
  }
}
