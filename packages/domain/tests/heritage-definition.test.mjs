import assert from "node:assert/strict";
import test from "node:test";
import { HeritageDefinition } from "../dist/index.js";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
const payload = () => ({
  kind: "heritage",
  identity: { id: "smith", name: "Smith" },
  components: HeritageDefinition.authorComponents(
    {},
    "Raised by rivers",
    "Adaptable",
    "Restless",
  ),
  extensions: { "test:private": { secret: true } },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
test("Heritage owns detached raw and envelope codecs and rejects invalid JSON", () => {
  const input = payload();
  const entity = HeritageDefinition.deserializePayload(input, {});
  input.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(
    HeritageDefinition.deserialize(entity.serialize(), {}).serializePayload(),
    payload(),
  );
  assert.throws(
    () => HeritageDefinition.deserializePayload(entity.serialize()),
    /Heritage kind/,
  );
  assert.throws(
    () =>
      HeritageDefinition.deserialize({
        ...entity.serialize(),
        schemaVersion: 2,
      }),
    /schema version/,
  );
  const cyclic = { kind: "heritage" };
  cyclic.self = cyclic;
  for (const input of [
    cyclic,
    { kind: "heritage", invalid: NaN },
    { kind: "heritage", invalid: new Date() },
  ])
    assert.throws(() => HeritageDefinition.deserializePayload(input), /JSON/);
  const output = entity.serializePayload();
  output.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Heritage exposes absent structure as unresolved and malformed pairs as invalid", () => {
  const incomplete = HeritageDefinition.deserializePayload({
    kind: "heritage",
  });
  assert.ok(codes(incomplete).includes("heritage-components-unresolved"));
  incomplete.dispose();
  for (const pairs of [null, [], [{ id: "a", beneficial: [], harmful: [] }]]) {
    const entity = HeritageDefinition.deserializePayload({
      ...payload(),
      components: { modifierPairs: pairs },
    });
    assert.ok(codes(entity).includes("heritage-components-invalid"));
    entity.dispose();
  }
});
test("Heritage accepts contract modifier variants without inventing Model governance", () => {
  const side = [
    { kind: "grant-action", actionId: "action" },
    { kind: "grant-trait", traitId: "trait" },
    {
      kind: "grant-skill-proficiency",
      skillDefinitionId: "skill",
      rank: "half",
    },
    { kind: "grant-discipline-access", disciplineDefinitionId: "discipline" },
    {
      kind: "rule-modifier",
      modifier: { id: "rule", target: "health", operation: "add" },
    },
    {
      kind: "choice",
      choice: { id: "choice", prompt: "Choose", minimum: 1, maximum: 1 },
    },
    { kind: "custom", key: "test:data", payload: { value: true } },
  ];
  const entity = HeritageDefinition.deserializePayload({
    ...payload(),
    components: {
      shortDescription: "",
      modifierPairs: [{ id: "rich", beneficial: side, harmful: side }],
    },
  });
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Heritage granted Conditions require captured references and recover when revalidated", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  const entity = HeritageDefinition.deserializePayload(data, {});
  assert.ok(codes(entity).includes("heritage-references-unresolved"));
  entity.validate({ records: [] });
  assert.ok(codes(entity).includes("heritage-codex-granted-conditions"));
  entity.validate({
    records: [
      {
        resourceType: WORLD_CODEX_RESOURCES.conditions,
        sourceId: "condition",
        payload: { id: "condition" },
      },
    ],
  });
  assert.deepEqual(codes(entity), []);
  entity.dispose();
  for (const grants of [
    null,
    [{ conditionId: "condition" }, { conditionId: "condition" }],
    [{ conditionId: "" }],
  ]) {
    data.components.grantedConditions = grants;
    const invalid = HeritageDefinition.deserializePayload(data, {
      records: [],
    });
    assert.ok(codes(invalid).includes("heritage-codex-granted-conditions"));
    invalid.dispose();
  }
});
test("Heritage rename emits committed nested identity and suppresses no-ops", async () => {
  const entity = HeritageDefinition.deserializePayload(payload(), {});
  const seen = [];
  entity.state$.subscribe((state) => seen.push(state.data.identity.name));
  entity.events.renamed.listen((event) =>
    seen.push(`event:${event.context.name}:${entity.state.data.identity.name}`),
  );
  for (const name of ["  Master smith  ", "Master smith"])
    await entity.command("rename", {
      initiator: "author",
      params: { name },
      context: {},
    });
  assert.deepEqual(seen, [
    "Smith",
    "Master smith",
    "event:Master smith:Master smith",
  ]);
  await assert.rejects(
    () =>
      entity.command("rename", {
        initiator: "author",
        params: { name: " " },
        context: {},
      }),
    /Heritage name/,
  );
  entity.dispose();
});
test("Heritage editing preserves rich pairs, modifiers, metadata, and explicit empty text", () => {
  const existing = HeritageDefinition.authorComponents(
    {},
    "Before",
    "Edge",
    "Cost",
  );
  existing.modifierPairs[0].private = { secret: true };
  existing.modifierPairs[0].beneficial.push({
    kind: "grant-trait",
    traitId: "trait",
  });
  existing.modifierPairs.push({
    id: "second",
    beneficial: [{ kind: "grant-action", actionId: "action" }],
    harmful: [{ kind: "grant-trait", traitId: "trait" }],
  });
  existing.prerequisites = [{ kind: "custom", payload: true }];
  const edited = HeritageDefinition.authorComponents(
    existing,
    "After",
    "",
    undefined,
  );
  assert.equal(edited.shortDescription, "After");
  assert.equal(edited.modifierPairs[0].beneficial[0].payload, "");
  assert.equal(edited.modifierPairs[0].harmful[0].payload, "Cost");
  assert.deepEqual(
    edited.modifierPairs[0].beneficial[1],
    existing.modifierPairs[0].beneficial[1],
  );
  assert.deepEqual(edited.modifierPairs[1], existing.modifierPairs[1]);
  assert.deepEqual(edited.prerequisites, existing.prerequisites);
  edited.modifierPairs[0].private.secret = false;
  assert.equal(existing.modifierPairs[0].private.secret, true);
  assert.equal(existing.modifierPairs[0].beneficial[0].payload, "Edge");
  const rich = { modifierPairs: [existing.modifierPairs[1]] };
  assert.deepEqual(
    HeritageDefinition.authorComponents(rich, "Description").modifierPairs,
    rich.modifierPairs,
  );
  const added = HeritageDefinition.authorComponents(rich, "Description", "New");
  assert.equal(added.modifierPairs.length, 2);
  assert.deepEqual(added.modifierPairs[0], rich.modifierPairs[0]);
  assert.equal(added.modifierPairs[1].beneficial[0].payload, "New");
});

test("Heritage does not coerce proficiency ranks and marks omitted required description unresolved", () => {
  const data = payload();
  data.components.modifierPairs[0].beneficial = [
    {
      kind: "grant-skill-proficiency",
      skillDefinitionId: "skill",
      rank: ["half"],
    },
  ];
  const invalid = HeritageDefinition.deserializePayload(data);
  assert.ok(codes(invalid).includes("heritage-components-invalid"));
  invalid.dispose();
  const missing = payload();
  delete missing.components.shortDescription;
  const unresolved = HeritageDefinition.deserializePayload(missing);
  assert.ok(codes(unresolved).includes("heritage-description-unresolved"));
  unresolved.dispose();
  assert.deepEqual(
    HeritageDefinition.authorComponents({ modifierPairs: [] }, "Updated")
      .modifierPairs,
    [],
  );
});
