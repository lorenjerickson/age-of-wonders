import test from "node:test";
import assert from "node:assert/strict";
import { CatalogCapture, catalogOwner } from "../dist/index.js";
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
test("real catalog capture resolves forward references and invalidates live custom registration after schema edit", async () => {
  const capture = new CatalogCapture(records),
    isolated = new CatalogCapture([records[0]]);
  try {
    assert.deepEqual(capture.issues(), []);
    assert.ok(isolated.issues().length);
    const owner = capture.graph.resolve({
      type: "extension-schemas",
      id: "schema",
    });
    const events = [];
    capture.graph
      .resolve({ type: "definitions", id: "custom" })
      .state$.subscribe((state) => events.push(state.metadata.validity.status));
    await owner.command("replace", {
      initiator: "author",
      params: { data: { ...schema, appliesTo: ["other"] } },
      context: {},
    });
    assert.ok(capture.issues().length);
    assert.equal(events.at(-1), "invalid");
    await owner.command("replace", {
      initiator: "author",
      params: { data: schema },
      context: {},
    });
    assert.deepEqual(capture.issues(), []);
    assert.deepEqual(capture.records()[0].payload, custom);
    assert.ok(isolated.issues().length);
  } finally {
    capture.dispose();
    isolated.dispose();
  }
});
test("catalog capture checks record identity and rejects duplicates without mutating caller records", () => {
  const bad = new CatalogCapture([{ ...records[1], sourceId: "different" }]);
  try {
    assert.ok(
      bad.issues().some((issue) => issue.code === "catalog-capture-identity"),
    );
  } finally {
    bad.dispose();
  }
  assert.throws(
    () => new CatalogCapture([records[1], records[1]]),
    /duplicated/,
  );
  assert.deepEqual(records[1].payload, schema);
});

test("unknown and prototype-like resource/kind names remain opaque compatibility input", () => {
  for (const name of ["constructor", "toString", "__proto__"]) {
    assert.equal(catalogOwner("definitions", { kind: name }), undefined);
    assert.equal(catalogOwner(name, {}), undefined);
  }
});
