import { GraphService } from "../graph/graph.service";
import { PrismaService } from "../prisma/prisma.service";
import { DomainService } from "./domain.service";

const location = (id: string, kind: string, parentLocationId?: string) => ({
  resource: "locations",
  id,
  kind,
  name: id,
  revision: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  data: {
    identity: { id },
    name: id,
    kind,
    placement: parentLocationId
      ? { kind: "within-parent", parentLocationId }
      : { kind: "root" },
  },
});

describe("DomainService singleton creation", () => {
  it("rejects every legacy Campaign mutation before persistence", async () => {
    const create = jest.fn(), update = jest.fn(), remove = jest.fn();
    const prisma = { domainRecord: { create, update, delete: remove } } as unknown as PrismaService;
    const service = new DomainService(prisma, {} as GraphService);
    await expect(service.create("campaigns", {})).rejects.toThrow("Use Campaign Definition authoring");
    await expect(service.replace("campaigns", "legacy", { data: {} })).rejects.toThrow("Use Campaign Definition authoring");
    await expect(service.remove("campaigns", "legacy")).rejects.toThrow("Use Campaign Definition authoring");
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    [
      "locations" as const,
      {
        identity: { id: "world:new" },
        name: "Another World",
        kind: "world",
        placement: { kind: "root" },
      },
      "A world already exists",
    ],
  ])("rejects a second %s aggregate", async (resource, data, message) => {
    const create = jest.fn();
    const prisma = {
      domainRecord: {
        count: jest.fn(() => Promise.resolve(1)),
        create,
      },
    } as unknown as PrismaService;
    const service = new DomainService(prisma, {} as GraphService);

    await expect(service.create(resource, data)).rejects.toThrow(message);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("DomainService neutral errors", () => {
  it("does not echo opaque identities in not-found or route/payload mismatch errors", async () => {
    const opaqueRouteId = "opaque-route-identity";
    const opaquePayloadId = "opaque-payload-identity";
    const prisma = {
      domainRecord: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new DomainService(prisma, {} as GraphService);

    const missing = service.get("items", opaqueRouteId);
    await expect(missing).rejects.toThrow(
      "The selected items resource was not found",
    );
    await expect(missing).rejects.not.toThrow(opaqueRouteId);

    const mismatch = service.replace("items", opaqueRouteId, {
      data: { id: opaquePayloadId },
    });
    await expect(mismatch).rejects.toThrow(
      "The selected resource does not match the submitted resource",
    );
    await expect(mismatch).rejects.not.toThrow(
      new RegExp(`${opaqueRouteId}|${opaquePayloadId}`),
    );
  });
});

describe("DomainService.removeWorld", () => {
  it("blocks destructive world deletion until archival is available", async () => {
    const world = location("world-1", "world");
    const removeDomainResource = jest.fn();
    const deleteRecord = jest.fn();
    const prisma = {
      domainRecord: {
        findUnique: jest.fn(() => Promise.resolve(world)),
        delete: deleteRecord,
      },
    } as unknown as PrismaService;
    const graph = {
      removeDomainResource,
    } as unknown as GraphService;
    const service = new DomainService(prisma, graph);

    await expect(service.removeWorld("world-1")).rejects.toThrow(
      "World deletion is disabled while archive and dependency-safe retention are introduced",
    );
    expect(deleteRecord).not.toHaveBeenCalled();
    expect(removeDomainResource).not.toHaveBeenCalled();
  });
});

describe("DomainService.list", () => {
  it("filters definition catalogs by their namespaced world extension", async () => {
    const findMany = jest.fn((input: { where: { data?: unknown } }) => {
      void input;
      return Promise.resolve([]);
    });
    const count = jest.fn(() => Promise.resolve(0));
    const prisma = {
      domainRecord: { findMany, count },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const service = new DomainService(prisma, {} as GraphService);

    await service.list("definitions", {
      kind: "item",
      worldId: "world-1",
      sort: "name",
      order: "asc",
      limit: 50,
      offset: 0,
    });

    expect(findMany.mock.calls[0]?.[0].where.data).toEqual({
      path: ["extensions", "aow:worldId"],
      equals: "world-1",
    });
  });

  it("includes legacy spell rows in discipline catalog queries", async () => {
    const findMany = jest.fn((input: { where: { kind?: unknown } }) => {
      void input;
      return Promise.resolve([]);
    });
    const count = jest.fn(() => Promise.resolve(0));
    const prisma = {
      domainRecord: { findMany, count },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const service = new DomainService(prisma, {} as GraphService);

    await service.list("definitions", {
      kind: "discipline",
      sort: "name",
      order: "asc",
      limit: 50,
      offset: 0,
    });

    expect(findMany.mock.calls[0]?.[0].where.kind).toEqual({
      in: ["discipline", "spell"],
    });
  });
});

describe("DomainService science compatibility", () => {
  it("returns a migrated view of a persisted legacy definition", async () => {
    const record = {
      resource: "definitions",
      id: "legacy:signal",
      kind: "spell",
      name: "Signal",
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      data: {
        identity: { id: "legacy:signal", name: "Signal" },
        kind: "spell",
        components: {
          level: 0,
          school: "divination",
          castingTime: [],
          range: "self",
          components: [],
          duration: { kind: "instant" },
          outcomes: [],
        },
      },
    };
    const prisma = {
      domainRecord: { findUnique: jest.fn(() => Promise.resolve(record)) },
    } as unknown as PrismaService;
    const service = new DomainService(prisma, {} as GraphService);

    const result = await service.get("definitions", "legacy:signal");

    expect(result.kind).toBe("discipline");
    expect(result.data).toMatchObject({
      kind: "discipline",
      components: {
        band: 0,
        functionTags: ["sensing"],
        operatingBasis: "optical",
      },
    });
  });

  it("rejects legacy contracts on new writes instead of silently migrating them", async () => {
    const create = jest.fn();
    const prisma = {
      domainRecord: { create },
    } as unknown as PrismaService;
    const service = new DomainService(prisma, {} as GraphService);

    await expect(
      service.create("definitions", {
        identity: { id: "legacy:signal", name: "Signal" },
        kind: "spell",
        components: {},
      }),
    ).rejects.toThrow(
      "New and updated aggregates must use the current science-and-technology domain contract.",
    );
    expect(create).not.toHaveBeenCalled();
  });
});
