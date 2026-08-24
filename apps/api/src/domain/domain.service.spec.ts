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

describe("DomainService.removeWorld", () => {
  it("removes connections and descendants before deleting the root world", async () => {
    const world = location("world-1", "world");
    const region = location("region-1", "region", "world-1");
    const site = location("site-1", "site", "region-1");
    const connection = {
      ...location("connection-1", "road"),
      resource: "location-connections",
      data: {
        identity: { id: "connection-1" },
        kind: "road",
        scopeLocationId: "world-1",
        fromLocationId: "region-1",
        toLocationId: "site-1",
      },
    };
    const creature = {
      ...location("creature-1", "monstrosity"),
      resource: "creatures",
      data: {
        identity: { id: "creature-1" },
        name: "Prism-Horn Stalker",
        worldId: "world-1",
      },
    };
    const item = {
      ...location("item-1", "item-instance"),
      resource: "items",
      data: { id: "item-1", extensions: { "aow:worldId": "world-1" } },
    };
    const definition = {
      ...location("definition-1", "item"),
      resource: "definitions",
      data: {
        identity: { id: "definition-1" },
        kind: "item",
        extensions: { "aow:worldId": "world-1" },
      },
    };
    const records = [
      world,
      region,
      site,
      connection,
      creature,
      item,
      definition,
    ];
    const deleted: string[] = [];
    const prisma = {
      domainRecord: {
        findUnique: jest.fn(() => Promise.resolve(world)),
        findMany: jest.fn(({ where }: { where: { resource: string } }) =>
          Promise.resolve(
            records.filter((record) => record.resource === where.resource),
          ),
        ),
        delete: jest.fn(
          ({ where }: { where: { resource_id: { id: string } } }) => {
            const record = records.find(
              (candidate) => candidate.id === where.resource_id.id,
            );
            if (!record) throw new Error("missing test record");
            deleted.push(record.id);
            return Promise.resolve(record);
          },
        ),
      },
    } as unknown as PrismaService;
    const graph = {
      removeDomainResource: jest.fn(() => Promise.resolve()),
    } as unknown as GraphService;
    const service = new DomainService(prisma, graph);

    await service.removeWorld("world-1");

    expect(deleted).toEqual([
      "connection-1",
      "creature-1",
      "item-1",
      "definition-1",
      "site-1",
      "region-1",
      "world-1",
    ]);
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
