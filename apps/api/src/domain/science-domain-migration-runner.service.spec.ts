import type { DomainRecord } from "@prisma/client";
import { GraphService } from "../graph/graph.service";
import { PrismaService } from "../prisma/prisma.service";
import { ScienceDomainMigrationRunnerService } from "./science-domain-migration-runner.service";

function legacyDisciplineRecord(): DomainRecord {
  return {
    resource: "definitions",
    id: "internal-definition-id",
    kind: "spell",
    name: "Protective Screen",
    revision: 4,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    data: {
      identity: {
        id: "internal-definition-id",
        name: "Protective Screen",
      },
      kind: "spell",
      components: {
        level: 1,
        school: "abjuration",
        castingTime: [],
        range: "self",
        components: [],
        duration: { kind: "rounds", value: 1 },
        outcomes: [],
      },
    },
  };
}

describe("ScienceDomainMigrationRunnerService", () => {
  it("defaults to a non-mutating dry-run report", async () => {
    const updateMany = jest.fn();
    const prisma = {
      domainRecord: {
        findMany: jest.fn(() => Promise.resolve([legacyDisciplineRecord()])),
        updateMany,
      },
    } as unknown as PrismaService;
    const replaceDomainResource = jest.fn();
    const graph = { replaceDomainResource } as unknown as GraphService;
    const service = new ScienceDomainMigrationRunnerService(prisma, graph);

    const report = await service.run({ apply: false });

    expect(report).toMatchObject({
      mode: "dry-run",
      scanned: 1,
      changed: 1,
      applied: 0,
      graphProjectionsRebuilt: 0,
      unchanged: 0,
      failures: [],
      compatibilityRetirementReady: false,
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(replaceDomainResource).not.toHaveBeenCalled();
    expect(report.changes).toEqual([
      {
        resource: "definitions",
        name: "Protective Screen",
        kind: "discipline",
      },
    ]);
    expect(JSON.stringify(report)).not.toContain("internal-definition-id");
  });

  it("rebuilds the graph projection before applying an optimistic update", async () => {
    const calls: string[] = [];
    const updateMany = jest.fn(
      (input: {
        where: { revision: number };
        data: { kind?: string; revision?: { increment: number } };
      }) => {
        void input;
        calls.push("record");
        return Promise.resolve({ count: 1 });
      },
    );
    const prisma = {
      domainRecord: {
        findMany: jest.fn(() => Promise.resolve([legacyDisciplineRecord()])),
        updateMany,
      },
    } as unknown as PrismaService;
    const graph = {
      replaceDomainResource: jest.fn(() => {
        calls.push("graph");
        return Promise.resolve();
      }),
    } as unknown as GraphService;
    const service = new ScienceDomainMigrationRunnerService(prisma, graph);

    const report = await service.run({ apply: true });

    expect(calls).toEqual(["graph", "record"]);
    const update = updateMany.mock.calls[0]?.[0];
    expect(update?.where.revision).toBe(4);
    expect(update?.data).toMatchObject({
      kind: "discipline",
      revision: { increment: 1 },
    });
    expect(report).toMatchObject({
      mode: "apply",
      changed: 1,
      applied: 1,
      graphProjectionsRebuilt: 1,
      failures: [],
    });
  });

  it("uses a neutral item label instead of exposing its internal definition ID", async () => {
    const record: DomainRecord = {
      resource: "items",
      id: "internal-item-id",
      kind: "item-instance",
      name: "internal-definition-id",
      revision: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      data: {
        id: "internal-item-id",
        definitionId: "internal-definition-id",
        magical: true,
      },
    };
    const prisma = {
      domainRecord: { findMany: jest.fn(() => Promise.resolve([record])) },
    } as unknown as PrismaService;
    const service = new ScienceDomainMigrationRunnerService(
      prisma,
      {} as GraphService,
    );

    const report = await service.run({ apply: false });

    expect(report.exceptions[0]?.name).toBe("Unnamed item instance");
    expect(JSON.stringify(report)).not.toContain("internal-definition-id");
    expect(JSON.stringify(report)).not.toContain("internal-item-id");
  });

  it("signals compatibility retirement only for a clean, fully current store", async () => {
    const prisma = {
      domainRecord: { findMany: jest.fn(() => Promise.resolve([])) },
    } as unknown as PrismaService;
    const service = new ScienceDomainMigrationRunnerService(
      prisma,
      {} as GraphService,
    );

    const report = await service.run({ apply: false });

    expect(report.compatibilityRetirementReady).toBe(true);
  });
});
