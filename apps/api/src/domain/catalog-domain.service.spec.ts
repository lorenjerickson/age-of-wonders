import { BadRequestException, ConflictException } from "@nestjs/common";
import { DomainService } from "./domain.service";
import { PrismaService } from "../prisma/prisma.service";
import { GraphService } from "../graph/graph.service";

export const catalogDefinition = (kind: string, id = kind) => ({
  kind,
  identity: {
    id,
    key: `test:${kind}`,
    name: `Test ${kind}`,
    source: { namespace: "test", edition: "2024" },
  },
  components:
    kind === "table"
      ? { entries: [{ minimum: 1, maximum: 1, value: "plain narrative" }] }
      : kind === "custom"
        ? {
            definitionKind: "test:custom",
            schemaId: "later-schema",
            data: { private: true },
          }
        : {},
  extensions: { "test:private": { untouched: [1, "two"] } },
});
const setup = () => {
  type Row = {
    revision: number;
    data: Record<string, unknown>;
    [key: string]: unknown;
  };
  let record: Row | undefined;
  const graph = {
    addDomainResource: jest.fn(),
    replaceDomainResource: jest.fn(),
  };
  const store = {
    create: jest.fn(
      ({
        data,
      }: {
        data: Omit<Row, "revision"> & { data: Record<string, unknown> };
      }) => Promise.resolve((record = { ...data, revision: 1 })),
    ),
    findUnique: jest.fn(() => Promise.resolve(record ?? null)),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { revision: number };
        data: Omit<Row, "revision"> & { data: Record<string, unknown> };
      }) => {
        if (!record || record.revision !== where.revision)
          return Promise.resolve({ count: 0 });
        record = { ...record, ...data, revision: record.revision + 1 };
        return Promise.resolve({ count: 1 });
      },
    ),
  };
  return {
    service: new DomainService(
      { domainRecord: store } as unknown as PrismaService,
      graph as unknown as GraphService,
    ),
    store,
    graph,
  };
};
describe("Catalog DomainService ownership", () => {
  it.each(["language", "table", "custom"])(
    "preserves %s payloads and unresolved imported references",
    async (kind) => {
      const { service } = setup();
      const data = catalogDefinition(kind);
      const saved = await service.create("definitions", data);
      expect(saved.data).toEqual(data);
      expect((await service.get("definitions", kind)).data).toEqual(data);
    },
  );
  it.each([
    [
      "extension-schemas",
      {
        id: "schema",
        key: "test:custom",
        appliesTo: ["custom"],
        jsonSchema: { type: "object" },
        semanticVersion: "1.0.0",
      },
    ],
    [
      "rule-variants",
      {
        id: "variant",
        key: "test:variant",
        name: "Variant",
        defaultEnabled: false,
        requires: ["forward"],
      },
    ],
    [
      "content-packs",
      {
        id: "pack",
        namespace: "test",
        name: "Pack",
        version: "1.0.0",
        edition: "2024",
        source: { namespace: "test", edition: "2024" },
        definitionIds: ["forward"],
      },
    ],
    [
      "systems",
      {
        id: "system",
        name: "System",
        editions: ["2024"],
        engineSchemaVersion: "1",
        catalog: { definitions: [], variants: [], packs: [] },
        enabledVariantIds: [],
        configuration: {},
        extensions: { "test:private": true },
      },
    ],
  ] as const)(
    "validates the existing %s resource writer",
    async (resource, data) => {
      const { service } = setup();
      expect((await service.create(resource, data)).data).toEqual(data);
    },
  );
  it("rejects malformed supplied catalog fields before writes and graph projection", async () => {
    const { service, store, graph } = setup();
    const data = {
      ...catalogDefinition("table"),
      components: { entries: "bad" },
    };
    await expect(service.create("definitions", data)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(store.create).not.toHaveBeenCalled();
    expect(graph.addDomainResource).not.toHaveBeenCalled();
  });
  it("keeps private imported data through replacement and rejects stale writes atomically", async () => {
    const { service, graph } = setup();
    const data = catalogDefinition("language");
    await service.create("definitions", data);
    const changed = {
      ...data,
      components: { script: "Runes", rarity: "test:regional" },
    };
    const saved = await service.replace("definitions", "language", {
      data: changed,
      expectedRevision: 1,
    });
    expect(saved.data).toEqual(changed);
    expect(saved.revision).toBe(2);
    await expect(
      service.replace("definitions", "language", { data, expectedRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await service.get("definitions", "language")).data).toEqual(
      changed,
    );
    expect(graph.replaceDomainResource).toHaveBeenCalledTimes(1);
    await expect(
      service.replace("definitions", "language", {
        data: { ...data, components: { script: [] } },
        expectedRevision: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await service.get("definitions", "language")).revision).toBe(2);
  });
});
