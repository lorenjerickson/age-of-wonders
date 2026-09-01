import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
import { migrateScienceDomainData } from "./science-domain-migration";

@Injectable()
export class DomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
  ) {}

  async create(resource: DomainResource, data: Record<string, unknown>) {
    this.assertCurrentScienceContract(resource, data);
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
          `${resource} resource '${metadata.id}' already exists`,
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
    this.assertCurrentScienceContract(resource, dto.data);
    const metadata = readResourceMetadata(resource, dto.data);
    if (metadata.id !== id) {
      throw new ConflictException(
        `Route ID '${id}' does not match data ID '${metadata.id}'`,
      );
    }

    const previous = await this.findRaw(resource, id);
    if (!isObject(previous.data)) {
      throw new ConflictException(
        `${resource} resource '${id}' does not contain an object aggregate`,
      );
    }

    const update = {
      ...metadata,
      data: dto.data as Prisma.InputJsonObject,
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
        dto.data,
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
        dto.data,
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

  async removeWorld(id: string): Promise<void> {
    const world = await this.get("locations", id);
    if (world.kind !== "world") {
      throw new BadRequestException(
        `Location '${id}' is not a root world and cannot be deleted as one`,
      );
    }

    const locations = await this.prisma.domainRecord.findMany({
      where: { resource: "locations" },
    });
    const children = new Map<string, string[]>();
    for (const location of locations) {
      if (!isObject(location.data)) continue;
      const placement = isObject(location.data.placement)
        ? location.data.placement
        : {};
      if (
        placement.kind !== "within-parent" ||
        typeof placement.parentLocationId !== "string"
      ) {
        continue;
      }
      const siblings = children.get(placement.parentLocationId) ?? [];
      siblings.push(location.id);
      children.set(placement.parentLocationId, siblings);
    }

    const hierarchyIds = new Set<string>();
    const deletionOrder: string[] = [];
    const visit = (locationId: string) => {
      if (hierarchyIds.has(locationId)) return;
      hierarchyIds.add(locationId);
      for (const childId of children.get(locationId) ?? []) visit(childId);
      deletionOrder.push(locationId);
    };
    visit(id);

    const campaigns = await this.prisma.domainRecord.findMany({
      where: { resource: "campaigns" },
    });
    const campaignIds = new Set(
      campaigns
        .filter(
          (campaign) => isObject(campaign.data) && campaign.data.worldId === id,
        )
        .map((campaign) => campaign.id),
    );

    const sessions = await this.prisma.domainRecord.findMany({
      where: { resource: "sessions" },
    });
    for (const session of sessions) {
      if (
        isObject(session.data) &&
        (session.data.worldId === id ||
          (typeof session.data.campaignId === "string" &&
            campaignIds.has(session.data.campaignId)))
      ) {
        await this.remove("sessions", session.id);
      }
    }

    const games = await this.prisma.domainRecord.findMany({
      where: { resource: "games" },
    });
    for (const game of games) {
      if (!isObject(game.data) || !isObject(game.data.campaign)) continue;
      const identity = isObject(game.data.campaign.identity)
        ? game.data.campaign.identity
        : undefined;
      if (typeof identity?.id === "string" && campaignIds.has(identity.id)) {
        await this.remove("games", game.id);
      }
    }

    for (const campaign of campaigns) {
      if (campaignIds.has(campaign.id)) {
        await this.remove("campaigns", campaign.id);
      }
    }

    const connections = await this.prisma.domainRecord.findMany({
      where: { resource: "location-connections" },
    });
    for (const connection of connections) {
      if (!isObject(connection.data)) continue;
      const referencedIds = [
        connection.data.scopeLocationId,
        connection.data.fromLocationId,
        connection.data.toLocationId,
      ];
      if (
        referencedIds.some(
          (value) => typeof value === "string" && hierarchyIds.has(value),
        )
      ) {
        await this.remove("location-connections", connection.id);
      }
    }
    const creatures = await this.prisma.domainRecord.findMany({
      where: {
        resource: "creatures",
        data: { path: ["worldId"], equals: id },
      },
    });
    for (const creature of creatures) {
      await this.remove("creatures", creature.id);
    }
    for (const resource of ["items", "definitions"] as const) {
      const records = await this.prisma.domainRecord.findMany({
        where: {
          resource,
          data: { path: ["extensions", "aow:worldId"], equals: id },
        },
      });
      for (const record of records) {
        await this.remove(resource, record.id);
      }
    }
    for (const locationId of deletionOrder) {
      await this.remove("locations", locationId);
    }
  }

  private notFound(resource: DomainResource, id: string): never {
    throw new NotFoundException(`${resource} resource '${id}' was not found`);
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      isObject(error) &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code === code
    );
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
