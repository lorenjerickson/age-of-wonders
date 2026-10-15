import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DomainService } from "./domain.service";
import { ScienceDomainArchiveService } from "./science-domain-archive.service";
import { createScienceDomainArchive } from "./science-domain-archive";
import { GraphService } from "../graph/graph.service";
import { PrismaService } from "../prisma/prisma.service";

const url = process.env.CATALOG_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("B06 catalog PostgreSQL caller boundary", () => {
  let db: PrismaClient;
  let domain: DomainService;
  let archives: ScienceDomainArchiveService;
  beforeAll(async () => {
    if (
      !url ||
      !/^\/aow_b06_disposable_[a-z0-9_]+$/i.test(new URL(url).pathname)
    )
      throw new Error("Use the dedicated B06 disposable database.");
    db = new PrismaClient({ datasourceUrl: url });
    await db.$connect();
    const prisma = db as unknown as PrismaService;
    const graph = {
      addDomainResource: jest.fn(),
      replaceDomainResource: jest.fn(),
    } as unknown as GraphService;
    domain = new DomainService(prisma, graph);
    archives = new ScienceDomainArchiveService(prisma, domain, graph);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("imports forward schema references, reads back private state and rejects stale or invalid replacement", async () => {
    const id = randomUUID(),
      schemaId = randomUUID();
    const data = {
      kind: "custom",
      identity: {
        id,
        key: "test:weather",
        name: "Weather",
        source: { namespace: "test", edition: "2024" },
      },
      components: {
        definitionKind: "test:weather",
        schemaId,
        data: { temperature: 12, nested: ["private", false] },
      },
      extensions: { "test:private": { retained: true } },
    };
    const schema = {
      id: schemaId,
      key: "test:weather",
      appliesTo: ["test:weather"],
      jsonSchema: { type: "object" },
      semanticVersion: "1.0.0",
    };
    const archive = createScienceDomainArchive([
      { resource: "extension-schemas", data: schema },
      { resource: "definitions", data },
    ]);
    // Canonical archive order intentionally writes Custom before ExtensionSchema.
    expect(archive.records[0]?.resource).toBe("definitions");
    const report = await archives.import(archive, { apply: true });
    expect(report.failures).toEqual([]);
    expect(report.created).toBe(2);
    expect((await domain.get("definitions", id)).data).toEqual(data);
    expect((await domain.get("extension-schemas", schemaId)).data).toEqual(
      schema,
    );
    const changed = {
      ...data,
      identity: { ...data.identity, name: "Cold weather" },
    };
    const results = await Promise.allSettled([
      domain.replace("definitions", id, { data: changed, expectedRevision: 1 }),
      domain.replace("definitions", id, {
        data: {
          ...changed,
          identity: { ...changed.identity, name: "Warm weather" },
        },
        expectedRevision: 1,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const after = await domain.get("definitions", id);
    expect(after.revision).toBe(2);
    expect((after.data as Record<string, unknown>).extensions).toEqual(
      data.extensions,
    );
    expect((after.data as Record<string, unknown>).components).toEqual(
      data.components,
    );
    await expect(
      domain.replace("definitions", id, {
        data: {
          ...data,
          components: { ...data.components, definitionKind: 3 },
        },
        expectedRevision: 2,
      }),
    ).rejects.toThrow("invalid structure");
    expect(await domain.get("definitions", id)).toEqual(after);
  });
  it("rejects malformed new catalogs without inserting any row", async () => {
    const id = randomUUID();
    await expect(
      domain.create("rule-variants", {
        id,
        key: "test:variant",
        name: "Variant",
        defaultEnabled: "bad",
      }),
    ).rejects.toThrow("invalid structure");
    expect(
      await db.domainRecord.findUnique({
        where: { resource_id: { resource: "rule-variants", id } },
      }),
    ).toBeNull();
  });
});
