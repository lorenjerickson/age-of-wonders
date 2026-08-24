import type { DomainRecord } from "@prisma/client";
import { GraphService } from "../graph/graph.service";
import { PrismaService } from "../prisma/prisma.service";
import { DomainService } from "./domain.service";
import { createScienceDomainArchive } from "./science-domain-archive";
import { ScienceDomainArchiveService } from "./science-domain-archive.service";

const locationData = (name: string) => ({
  identity: { id: "location-1" },
  name,
  kind: "site",
});

const existingLocation = (name: string): DomainRecord => ({
  resource: "locations",
  id: "location-1",
  kind: "site",
  name,
  revision: 3,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  data: locationData(name),
});

describe("ScienceDomainArchiveService", () => {
  it("exports persisted aggregates through the normalized archive codec", async () => {
    const prisma = {
      domainRecord: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              resource: "locations",
              id: "location-1",
              data: locationData("Observatory"),
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = new ScienceDomainArchiveService(
      prisma,
      {} as DomainService,
      {} as GraphService,
    );

    const archive = await service.export();

    expect(archive.schema).toBe("aow:science-domain-archive");
    expect(archive.records).toHaveLength(1);
    expect(archive.records[0]?.data.name).toBe("Observatory");
  });

  it("dry-runs creates and updates without mutating persistence", async () => {
    const existing = existingLocation("Old Observatory");
    const prisma = {
      domainRecord: {
        findUnique: jest.fn(() => Promise.resolve(existing)),
      },
    } as unknown as PrismaService;
    const create = jest.fn();
    const replace = jest.fn();
    const service = new ScienceDomainArchiveService(
      prisma,
      {
        create,
        replace,
      } as unknown as DomainService,
      {} as GraphService,
    );
    const archive = createScienceDomainArchive([
      { resource: "locations", data: locationData("New Observatory") },
    ]);

    const report = await service.import(archive, { apply: false });

    expect(report).toMatchObject({
      mode: "dry-run",
      scanned: 1,
      toCreate: 0,
      toUpdate: 1,
      unchanged: 0,
      created: 0,
      updated: 0,
      graphProjectionsRebuilt: 0,
      failures: [],
    });
    expect(create).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("applies new and changed records with optimistic replacement", async () => {
    const existing = existingLocation("Old Observatory");
    const findUnique = jest.fn(
      (input: { where: { resource_id: { id: string } } }) =>
        Promise.resolve(
          input.where.resource_id.id === "location-1" ? existing : null,
        ),
    );
    const prisma = {
      domainRecord: { findUnique },
    } as unknown as PrismaService;
    const create = jest.fn(() => Promise.resolve({}));
    const replace = jest.fn(() => Promise.resolve({}));
    const service = new ScienceDomainArchiveService(
      prisma,
      {
        create,
        replace,
      } as unknown as DomainService,
      {} as GraphService,
    );
    const archive = createScienceDomainArchive([
      { resource: "locations", data: locationData("New Observatory") },
      {
        resource: "locations",
        data: {
          identity: { id: "location-2" },
          name: "Field Station",
          kind: "site",
        },
      },
    ]);

    const report = await service.import(archive, { apply: true });

    expect(report).toMatchObject({
      mode: "apply",
      scanned: 2,
      toCreate: 1,
      toUpdate: 1,
      created: 1,
      updated: 1,
      graphProjectionsRebuilt: 2,
      failures: [],
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "locations",
      "location-1",
      expect.objectContaining({ expectedRevision: 3 }),
    );
  });

  it("rebuilds graph projections for unchanged records during apply", async () => {
    const existing = existingLocation("Observatory");
    const prisma = {
      domainRecord: {
        findUnique: jest.fn(() => Promise.resolve(existing)),
      },
    } as unknown as PrismaService;
    const replaceDomainResource = jest.fn(() => Promise.resolve());
    const service = new ScienceDomainArchiveService(
      prisma,
      {} as DomainService,
      { replaceDomainResource } as unknown as GraphService,
    );
    const archive = createScienceDomainArchive([
      { resource: "locations", data: locationData("Observatory") },
    ]);

    const report = await service.import(archive, { apply: true });

    expect(report).toMatchObject({
      unchanged: 1,
      graphProjectionsRebuilt: 1,
      failures: [],
    });
    expect(replaceDomainResource).toHaveBeenCalledTimes(1);
  });

  it("reports failures by human name without exposing opaque identifiers", async () => {
    const prisma = {
      domainRecord: {
        findUnique: jest.fn(() => Promise.reject(new Error("unavailable"))),
      },
    } as unknown as PrismaService;
    const service = new ScienceDomainArchiveService(
      prisma,
      {} as DomainService,
      {} as GraphService,
    );
    const archive = createScienceDomainArchive([
      {
        resource: "locations",
        data: {
          identity: { id: "opaque-location-id" },
          name: "Glass Observatory",
          kind: "site",
        },
      },
    ]);

    const report = await service.import(archive, { apply: false });

    expect(report.failures[0]?.name).toBe("Glass Observatory");
    expect(JSON.stringify(report)).not.toContain("opaque-location-id");
  });
});
