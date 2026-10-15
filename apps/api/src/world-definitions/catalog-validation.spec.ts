import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";
import {
  catalogPublicationIssues,
  catalogRecordIssue,
} from "./catalog-validation";
import { worldCodexSnapshotIssue } from "./world-codex-validation";
const schema = {
  id: "schema",
  key: "story:weather",
  appliesTo: ["custom"],
  jsonSchema: { type: "object" },
  semanticVersion: "1.0.0",
};
const custom = {
  kind: "custom",
  identity: {
    id: "custom",
    key: "story:custom",
    name: "Weather",
    source: { namespace: "story", edition: "2024" },
  },
  components: {
    definitionKind: "story:weather",
    schemaId: "schema",
    data: { rain: true },
  },
  private: "retained",
};
const records = [
  { resourceType: "definitions", sourceId: "custom", payload: custom },
  { resourceType: "extension-schemas", sourceId: "schema", payload: schema },
];
describe("World captured catalog policy", () => {
  it("resolves only declared captured schema identities at publication", () => {
    expect(
      catalogPublicationIssues(
        { definitionIds: ["custom"], schemaDefinitionIds: ["schema"] },
        records,
      ),
    ).toEqual([]);
    expect(
      catalogPublicationIssues(
        { definitionIds: ["custom"], schemaDefinitionIds: [] },
        records,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      catalogPublicationIssues(
        { definitionIds: ["custom"], schemaDefinitionIds: ["schema"] },
        [
          records[0],
          { ...records[1], payload: { ...schema, appliesTo: ["elsewhere"] } },
        ],
      ).length,
    ).toBeGreaterThan(0);
  });
  it("retains unchanged malformed imported fields but rejects changed invalid fields and publication", () => {
    const previous = { ...custom, kind: "language", components: { script: 7 } };
    const next = {
      ...previous,
      identity: { ...previous.identity, name: "Renamed" },
      private: { kept: true },
    };
    expect(
      catalogRecordIssue("definitions", "custom", next, previous),
    ).toBeUndefined();
    expect(
      catalogRecordIssue(
        "definitions",
        "custom",
        { ...next, components: { script: false } },
        previous,
      ),
    ).toBeDefined();
    expect(catalogRecordIssue("definitions", "custom", next)).toBeDefined();
    expect(
      worldCodexSnapshotIssue(
        [{ ...records[0], payload: next }],
        [{ ...records[0], payload: previous }],
      ),
    ).toBeUndefined();
  });
  it("keeps draft custom forward references repairable, does not reinterpret table strings as identities", () => {
    expect(catalogRecordIssue("definitions", "custom", custom)).toBeUndefined();
    const table = {
      ...custom,
      kind: "table",
      components: {
        entries: [{ minimum: 1, maximum: 2, value: "ordinary narrative" }],
      },
    };
    expect(
      catalogPublicationIssues(
        { definitionIds: ["custom"], schemaDefinitionIds: [] },
        [{ ...records[0], payload: table }],
      ),
    ).toEqual([]);
  });
});

it("actual World publication rejects unavailable registration while retaining the identical complete capture", () => {
  const root = {
    resourceType: "locations",
    sourceId: "root",
    payload: {
      identity: {
        id: "root",
        version: { revision: 1, updatedAt: "2026-10-15T00:00:00Z" },
      },
      name: "World",
      kind: "world",
      placement: { kind: "root" },
      map: {
        kind: "isometric",
        formatVersion: 1,
        dimensions: { x: 16, y: 16, z: 8 },
        cellSize: { value: 5, unit: "ft" },
        chunkSize: 16,
        materials: [
          {
            key: "terrain:grass",
            revision: 1,
            name: "Grass",
            terrainType: "terrain:grass",
          },
        ],
        chunks: [],
      },
    },
  };
  const content = {
    rootLocationId: "root",
    locationIds: ["root"],
    definitionIds: ["custom"],
    schemaDefinitionIds: ["schema"],
    worldPlacementDefinitionIds: [],
    modelSchemaReleaseIds: ["core"],
  };
  expect(validateWorldDefinitionDraft(content, [root, ...records])).toEqual({
    valid: true,
    issues: [],
  });
  expect(
    validateWorldDefinitionDraft({ ...content, schemaDefinitionIds: [] }, [
      root,
      ...records,
    ]).valid,
  ).toBe(false);
});
