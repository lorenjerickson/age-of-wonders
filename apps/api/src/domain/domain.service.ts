import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { catalogOwner } from "@aow/domain";
import { PrismaService } from "../prisma/prisma.service";
import { GraphService } from "../graph/graph.service";
import type {
  ListDomainResourcesDto,
  ReplaceDomainResourceDto,
} from "./dto/domain-resource.dto";
import {
  type DomainResource,
  isObject,
  readResourceMetadata,
} from "./domain-resource";
import { canonicalWorldRecordIssue } from "../world-definitions/world-authored-record";
import { migrateScienceDomainData } from "./science-domain-migration";

/** Historical DomainRecord reader and compatibility adapter.
 * Generic mutation methods have no HTTP controller or active generation consumer;
 * only retained legacy generator fixtures call them. Current authoring uses scoped
 * World owners and runtime uses Instance owners. Remove these mutation methods with
 * the legacy generator sources after archive decoding fixtures have replacements.
 */
@Injectable()
export class DomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
  ) {}

  async create(resource: DomainResource, data: Record<string, unknown>) {
    this.assertWritablePayload(resource, data);
    const metadata = readResourceMetadata(resource, data);
    if (
      resource === "campaigns" ||
      (resource === "locations" && metadata.kind === "world")
    ) {
      const existing = await this.prisma.domainRecord.count({
        where:
          resource === "campaigns"
            ? { resource: "campaigns" }
            : { resource: "locations", kind: "world" },
      });
      if (existing > 0) {
        throw new ConflictException(
          resource === "campaigns"
            ? "A campaign already exists. Reset the world before creating another campaign."
            : "A world already exists. Reset it before creating another world.",
        );
      }
    }
    try {
      const record = await this.prisma.domainRecord.create({
        data: {
          resource,
          ...metadata,
          data: data as Prisma.InputJsonObject,
        },
      });
      await this.graph.addDomainResource(
        resource,
        metadata.id,
        data,
        metadata.kind,
        metadata.name,
      );
      return record;
    } catch (error) {
      if (this.isPrismaError(error, "P2002")) {
        throw new ConflictException(
          `The selected ${resource} resource already exists`,
        );
      }
      throw error;
    }
  }

  async list(resource: DomainResource, query: ListDomainResourcesDto) {
    const worldIdPath =
      resource === "definitions" || resource === "items"
        ? ["extensions", "aow:worldId"]
        : ["worldId"];
    const where: Prisma.DomainRecordWhereInput = {
      resource,
      kind:
        resource === "definitions" && query.kind === "discipline"
          ? { in: ["discipline", "spell"] }
          : query.kind,
      data: query.worldId
        ? { path: worldIdPath, equals: query.worldId }
        : undefined,
      name: query.search
        ? { contains: query.search, mode: "insensitive" }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.domainRecord.findMany({
        where,
        orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.domainRecord.count({ where }),
    ]);

    return {
      items: items.map((record) => this.migrateRecord(resource, record)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async get(resource: DomainResource, id: string) {
    const record = await this.findRaw(resource, id);
    return this.migrateRecord(resource, record);
  }

  private async findRaw(resource: DomainResource, id: string) {
    const record = await this.prisma.domainRecord.findUnique({
      where: { resource_id: { resource, id } },
    });
    if (!record) this.notFound(resource, id);
    return record;
  }

  async replace(
    resource: DomainResource,
    id: string,
    dto: ReplaceDomainResourceDto,
  ) {
    this.assertWritablePayload(resource, dto.data);
    const metadata = readResourceMetadata(resource, dto.data);
    if (metadata.id !== id) {
      throw new ConflictException(
        "The selected resource does not match the submitted resource",
      );
    }

    const previous = await this.findRaw(resource, id);
    if (!isObject(previous.data)) {
      throw new ConflictException(
        `The selected ${resource} resource cannot be replaced`,
      );
    }

    const payload = await this.replaceCatalogPayload(
      resource,
      previous.data,
      dto.data,
    );

    const update = {
      ...metadata,
      data: payload as Prisma.InputJsonObject,
      revision: { increment: 1 },
    } satisfies Prisma.DomainRecordUpdateManyMutationInput;

    if (dto.expectedRevision !== undefined) {
      const result = await this.prisma.domainRecord.updateMany({
        where: { resource, id, revision: dto.expectedRevision },
        data: update,
      });
      if (result.count === 0) {
        const exists = await this.prisma.domainRecord.findUnique({
          where: { resource_id: { resource, id } },
          select: { revision: true },
        });
        if (!exists) this.notFound(resource, id);
        throw new ConflictException(
          `Revision conflict: expected ${dto.expectedRevision}, current revision is ${exists.revision}`,
        );
      }
      const record = await this.get(resource, id);
      await this.graph.replaceDomainResource(
        resource,
        id,
        previous.data,
        payload,
        previous.kind ?? undefined,
        previous.name ?? undefined,
        metadata.kind,
        metadata.name,
      );
      return record;
    }

    try {
      const record = await this.prisma.domainRecord.update({
        where: { resource_id: { resource, id } },
        data: update,
      });
      await this.graph.replaceDomainResource(
        resource,
        id,
        previous.data,
        payload,
        previous.kind ?? undefined,
        previous.name ?? undefined,
        metadata.kind,
        metadata.name,
      );
      return record;
    } catch (error) {
      if (this.isPrismaError(error, "P2025")) this.notFound(resource, id);
      throw error;
    }
  }

  async remove(resource: DomainResource, id: string) {
    this.assertLegacyRuntimeWriteDisabled(resource);
    try {
      const record = await this.prisma.domainRecord.delete({
        where: { resource_id: { resource, id } },
      });
      if (isObject(record.data)) {
        await this.graph.removeDomainResource(
          resource,
          id,
          record.data,
          record.kind ?? undefined,
          record.name ?? undefined,
        );
      }
    } catch (error) {
      if (this.isPrismaError(error, "P2025")) this.notFound(resource, id);
      throw error;
    }
  }

  /** Owner validation for retained authored mutations; historical restore uses its separate codec boundary. */
  assertWritablePayload(
    resource: DomainResource,
    data: Record<string, unknown>,
  ): void {
    this.assertLegacyRuntimeWriteDisabled(resource);
    this.assertCurrentScienceContract(resource, data);
    this.assertCatalogStructure(resource, data);
    const metadata = readResourceMetadata(resource, data);
    const issue = canonicalWorldRecordIssue(resource, metadata.id, data);
    if (issue) throw new BadRequestException(issue);
  }

  /** Archive metadata decoding is not semantic authoring or runtime publication. */
  assertHistoricalArchivePayload(
    resource: DomainResource,
    data: Record<string, unknown>,
  ): void {
    readResourceMetadata(resource, data);
  }

  private assertLegacyRuntimeWriteDisabled(resource: DomainResource): void {
    if (resource === "location-connections") {
      throw new ConflictException(
        "Location travel connections are retired. Use Location hierarchy; travel is handled at the table.",
      );
    }
    if (
      [
        "characters",
        "creatures",
        "items",
        "objects",
        "campaigns",
        "games",
        "sessions",
        "scenes",
        "encounters",
        "pending-decisions",
        "game-events",
      ].includes(resource)
    ) {
      throw new ConflictException(
        "Legacy campaign and play-state writes are disabled. Use Campaign Definition authoring or Campaign Instance management.",
      );
    }
  }

  async removeWorld(id: string): Promise<void> {
    const world = await this.get("locations", id);
    if (world.kind !== "world") {
      throw new BadRequestException(
        "The selected Location is not a root World and cannot be deleted as one",
      );
    }
    throw new ConflictException(
      "World deletion is disabled while archive and dependency-safe retention are introduced",
    );
  }

  private notFound(resource: DomainResource, id: string): never {
    void id;
    throw new NotFoundException(
      `The selected ${resource} resource was not found`,
    );
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      isObject(error) &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code === code
    );
  }

  /** Compatibility writes validate supplied structure, retaining forward references for archive import. */
  private assertCatalogStructure(
    resource: DomainResource,
    data: Record<string, unknown>,
  ): void {
    try {
      const entity = catalogOwner(resource, data, { mode: "draft" });
      if (!entity) return;
      try {
        if (
          entity.state.metadata.validity.issues.some(
            (issue) => issue.blocking !== false,
          )
        )
          throw new Error("Invalid catalog structure.");
      } finally {
        entity.dispose();
      }
    } catch {
      throw new BadRequestException(
        "The catalog resource has invalid structure. Repair its supplied fields before saving.",
      );
    }
  }

  private async replaceCatalogPayload(
    resource: DomainResource,
    previous: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const entity = catalogOwner(resource, previous, { mode: "draft" });
      if (!entity) return data;
      try {
        const receipt = await entity.command("replace", {
          initiator: "domain-resource-adapter",
          params: { data },
          context: {},
        });
        if (receipt.status !== "committed" && receipt.status !== "unchanged")
          throw new Error("Catalog replacement rejected.");
        return entity.serializePayload();
      } finally {
        entity.dispose();
      }
    } catch {
      throw new BadRequestException(
        "The catalog resource cannot be replaced with the supplied data.",
      );
    }
  }

  private assertCurrentScienceContract(
    resource: DomainResource,
    data: Record<string, unknown>,
  ): void {
    if (migrateScienceDomainData(resource, data).changed) {
      throw new BadRequestException(
        "New and updated aggregates must use the current science-and-technology domain contract. Use the versioned migration or archive importer for legacy data.",
      );
    }
  }

  private migrateRecord<
    T extends {
      data: Prisma.JsonValue;
      kind: string | null;
      name: string | null;
    },
  >(resource: DomainResource, record: T): T {
    if (!isObject(record.data)) return record;
    const migration = migrateScienceDomainData(resource, record.data);
    if (!migration.changed) return record;
    const metadata = readResourceMetadata(resource, migration.data);
    return {
      ...record,
      data: migration.data as Prisma.JsonObject,
      kind: metadata.kind ?? null,
      name: metadata.name ?? null,
    };
  }
}
