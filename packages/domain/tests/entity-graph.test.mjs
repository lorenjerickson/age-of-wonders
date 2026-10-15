import assert from "node:assert/strict";
import test from "node:test";
import { Entity, EntityGraph } from "../dist/index.js";
const ref = (id) => ({ type: "catalog", id });
const invoke = (params) => ({ initiator: { id: "gm" }, params, context: {} });
class Catalog extends Entity {
  constructor(data, options) {
    super("catalog", data, ["changed"], { mode: "draft" }, options);
  }
  validateState(data, context) {
    return context.mode === "publication" && !data.name
      ? [{ code: "name.required", message: "Name required." }]
      : [];
  }
  handleCommand(_, { params }) {
    return {
      data: { ...this.state.data, ...params },
      events: [{ name: "changed", context: {} }],
    };
  }
}
const references = (data) => data.refs ?? [];
const add = (graph, id, data = {}, owner) =>
  graph.add(
    ref(id),
    new Catalog({ name: id, ...data }, { scope: graph.scope }),
    { references, owner },
  );

test("identity is graph scoped; references and transitive validity recover on registration, changes and removal", async () => {
  const graph = new EntityGraph(),
    other = new EntityGraph();
  const a = add(graph, "a", { refs: [ref("b")] }),
    outsider = add(other, "b");
  assert.equal(a.state.metadata.validity.status, "unresolved");
  assert.notEqual(graph.resolve(ref("b")), outsider);
  const b = add(graph, "b", { refs: [ref("c")] }),
    c = add(graph, "c", { name: "" });
  graph.validate({ mode: "publication" });
  assert.equal(a.state.metadata.validity.status, "invalid");
  await c.command("edit", invoke({ name: "Fixed" }));
  assert.equal(a.state.metadata.validity.status, "valid");
  assert.equal(a.state.metadata.revision, 0);
  graph.remove(ref("c"));
  assert.equal(b.state.metadata.validity.status, "unresolved");
  assert.equal(a.state.metadata.validity.status, "unresolved");
  graph.dispose();
  other.dispose();
});

test("candidate reference rejection publishes neither state nor mapped events; successful commands invalidate dependencies", async () => {
  const graph = new EntityGraph();
  const a = add(graph, "a"),
    b = add(graph, "b");
  const states = [],
    events = [];
  a.state$.subscribe((state) => states.push(state));
  a.events.changed.listen((event) => events.push(event));
  const before = a.state;
  const receipt = await a.command("edit", invoke({ refs: [ref("missing")] }));
  assert.equal(receipt.status, "rejected");
  assert.equal(a.state, before);
  assert.equal(states.length, 1);
  assert.equal(events.length, 0);
  const unsubscribe = a.events.changed.listen(
    b.command("edit").bind({ map: () => invoke({ name: "mapped" }) }),
  );
  await a.command("edit", invoke({ refs: [ref("b")] }));
  assert.equal(b.state.data.name, "mapped");
  assert.equal(events.length, 1);
  unsubscribe();
  graph.dispose();
});

test("cyclic references terminate, while ownership cycles and duplicate identities fail", async () => {
  const graph = new EntityGraph();
  const a = add(graph, "a", { refs: [ref("b")] });
  const b = add(graph, "b", { refs: [ref("a")] });
  assert.equal(a.state.metadata.validity.status, "valid");
  await b.command("edit", invoke({ name: "changed" }));
  assert.equal(a.state.metadata.validity.status, "valid");
  assert.throws(() => add(graph, "a"), /Duplicate/);
  const x = add(graph, "x", {}, ref("y"));
  assert.throws(() => add(graph, "y", {}, ref("x")), /cycles/);
  assert.equal(x.state.metadata.validity.status, "unresolved");
  graph.dispose();
});

test("hydration isolates identities and retains current child state; owner removal completes children", async () => {
  const graph = new EntityGraph();
  add(graph, "root");
  const child = add(
    graph,
    "child",
    { private: { untouched: true } },
    ref("root"),
  );
  await child.command("edit", invoke({ name: "Updated" }));
  const snapshot = graph.serialize();
  const restored = EntityGraph.hydrate(
    snapshot,
    (serialized, options) => ({
      entity: new Catalog(serialized.data, options),
      references,
    }),
    { mode: "publication" },
  );
  assert.notEqual(restored.scope, graph.scope);
  assert.notEqual(restored.resolve(ref("child")), child);
  assert.equal(
    restored.children(ref("root"))[0],
    restored.resolve(ref("child")),
  );
  assert.deepEqual(restored.serialize(), snapshot);
  let completed = 0;
  restored
    .resolve(ref("child"))
    .state$.subscribe({ complete: () => completed++ });
  restored.remove(ref("root"));
  assert.equal(completed, 1);
  assert.equal(restored.resolve(ref("child")), undefined);
  assert.equal(child.disposed, false);
  restored.dispose();
  graph.dispose();
  await assert.rejects(
    child.command("edit", invoke({ name: "late" })),
    /disposed/,
  );
});

test("failed hydration disposes created entities; teardown invalidates live dependents", () => {
  const created = [];
  const snapshot = {
    schemaVersion: 1,
    nodes: [
      {
        reference: ref("a"),
        entity: { type: "catalog", schemaVersion: 1, data: { name: "A" } },
      },
      {
        reference: ref("b"),
        entity: { type: "bad", schemaVersion: 1, data: {} },
      },
    ],
  };
  assert.throws(
    () =>
      EntityGraph.hydrate(
        snapshot,
        (serialized, options) => {
          if (serialized.type === "bad") throw new Error("bad codec");
          const entity = new Catalog(serialized.data, options);
          created.push(entity);
          return { entity };
        },
        { mode: "runtime" },
      ),
    /bad codec/,
  );
  assert.equal(created[0].disposed, true);
  const graph = new EntityGraph(),
    a = add(graph, "a", { refs: [ref("b")] }),
    b = add(graph, "b");
  b.dispose();
  assert.equal(a.state.metadata.validity.status, "unresolved");
  graph.dispose();
});

test("mode switches preserve captured policy and live context sees dependency edits", async () => {
  class Custom extends Catalog {
    constructor(data, options) {
      super(data, options);
      this.validate({ mode: "draft", sourceId: "captured" });
    }
    validateState(data, context) {
      if (context.sourceId !== "captured")
        return [{ code: "context.lost", message: "Context lost." }];
      return context.schemaName === "allowed"
        ? []
        : [
            {
              code: "schema.changed",
              message: "Schema disallows custom value.",
            },
          ];
    }
  }
  const graph = new EntityGraph();
  const schema = add(graph, "schema", { name: "allowed" });
  const custom = graph.add(
    ref("custom"),
    new Custom({ name: "custom" }, { scope: graph.scope }),
    {
      references: () => [ref("schema")],
      context: () => ({ schemaName: schema.state.data.name }),
    },
  );
  graph.validate({ mode: "publication" });
  assert.equal(custom.state.metadata.validity.status, "valid");
  await schema.command("edit", invoke({ name: "forbidden" }));
  assert.equal(custom.state.metadata.validity.issues[0].code, "schema.changed");
  await schema.command("edit", invoke({ name: "allowed" }));
  assert.equal(custom.state.metadata.validity.status, "valid");
  graph.dispose();
});

test("registration failures release hooks and graph identity, and a shared scope cannot share registered entities", () => {
  const graph = new EntityGraph();
  const entity = new Catalog({ name: "A" }, { scope: graph.scope });
  assert.throws(
    () =>
      graph.add(ref("a"), entity, {
        references: () => {
          throw new Error("invalid references");
        },
      }),
    /invalid references/,
  );
  assert.equal(graph.resolve(ref("a")), undefined);
  graph.add(ref("a"), entity);
  const other = new EntityGraph({ scope: graph.scope });
  assert.throws(() => other.add(ref("a"), entity), /one graph identity/);
  other.dispose();
  graph.dispose();
});

test("disposing a registered owner directly releases its persistent children", () => {
  const graph = new EntityGraph();
  const root = add(graph, "root"),
    child = add(graph, "child", {}, ref("root"));
  root.dispose();
  assert.equal(child.disposed, true);
  assert.equal(graph.resolve(ref("root")), undefined);
  assert.equal(graph.resolve(ref("child")), undefined);
  graph.dispose();
});
