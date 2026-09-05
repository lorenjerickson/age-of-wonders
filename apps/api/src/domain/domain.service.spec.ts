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
    [
      "campaigns" as const,
      {
        identity: { id: "campaign:new" },
        name: "Another Campaign",
        worldId: "world:current",
      },
      "A campaign already exists",
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
    const campaign = {
      ...location("campaign-1", "campaign"),
      resource: "campaigns",
      data: {
        identity: { id: "campaign-1" },
        name: "The Glasswake",
        worldId: "world-1",
      },
    };
    const session = {
      ...location("session-1", "session"),
      resource: "sessions",
      data: {
        identity: { id: "session-1" },
        name: "Into the Observatory",
        worldId: "world-1",
        campaignId: "campaign-1",
      },
    };
    const game = {
      ...location("campaign-1", "game-state"),
      resource: "games",
      data: {
        campaign: {
          identity: { id: "campaign-1" },
          name: "The Glasswake",
        },
      },
    };
    const otherCampaign = {
      ...campaign,
      id: "campaign-2",
      data: {
        identity: { id: "campaign-2" },
        name: "Elsewhere",
        worldId: "world-2",
      },
    };
    const otherSession = {
      ...session,
      id: "session-2",
      data: {
        identity: { id: "session-2" },
        name: "Elsewhere",
        worldId: "world-2",
        campaignId: "campaign-2",
      },
    };
    const otherGame = {
      ...game,
      id: "campaign-2",
      data: {
        campaign: {
          identity: { id: "campaign-2" },
          name: "Elsewhere",
        },
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
      campaign,
      session,
      game,
      otherCampaign,
      otherSession,
      otherGame,
    ];
    const deleted: string[] = [];
    const prisma = {
      campaignMembership: {
        findMany: jest.fn(() => Promise.resolve([])),
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      campaignInvitation: {
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      user: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
      domainRecord: {
        findUnique: jest.fn(() => Promise.resolve(world)),
        findMany: jest.fn(({ where }: { where: { resource: string } }) =>
          Promise.resolve(
            records.filter((record) => record.resource === where.resource),
          ),
        ),
        delete: jest.fn(
          ({
            where,
          }: {
            where: { resource_id: { resource: string; id: string } };
          }) => {
            const record = records.find(
              (candidate) =>
                candidate.resource === where.resource_id.resource &&
                candidate.id === where.resource_id.id,
            );
            if (!record) throw new Error("missing test record");
            deleted.push(`${record.resource}:${record.id}`);
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
      "sessions:session-1",
      "games:campaign-1",
      "campaigns:campaign-1",
      "location-connections:connection-1",
      "creatures:creature-1",
      "items:item-1",
      "definitions:definition-1",
      "locations:site-1",
      "locations:region-1",
      "locations:world-1",
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
