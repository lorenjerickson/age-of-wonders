import test from "node:test";
import assert from "node:assert/strict";
import {
  LanguageDefinition,
  TableDefinition,
  CustomDefinition,
  ExtensionSchema,
  RuleVariant,
  ContentPack,
  GameSystem,
} from "../dist/index.js";
const source = { namespace: "story", edition: "homebrew:story" };
const def = (kind, components = {}) => ({
  identity: { id: kind, key: `story:${kind}`, name: kind, source },
  kind,
  components,
  extensions: { "private:notes": { secret: true } },
  imported: ["keep"],
});
const variant = (id, extra = {}) => ({
  id,
  key: `story:${id}`,
  name: id,
  defaultEnabled: false,
  ...extra,
});
const schema = () => ({
  id: "schema",
  key: "story:weather",
  appliesTo: ["custom"],
  jsonSchema: { type: "object" },
  semanticVersion: "1.0.0",
  imported: true,
});
const invoke = (data) => ({
  initiator: "author",
  params: { data },
  context: {},
});
test("catalog raw and envelope codecs preserve private fields and reject unsupported envelopes", () => {
  const raw = {
    ...def("language", { script: "Runes", rarity: "homebrew rarity" }),
    type: "language",
    schemaVersion: 9,
  };
  const owner = LanguageDefinition.deserializePayload(raw);
  assert.deepEqual(owner.serializePayload(), raw);
  assert.deepEqual(
    LanguageDefinition.deserialize(owner.serialize()).serializePayload(),
    raw,
  );
  assert.throws(() => LanguageDefinition.deserialize(raw), /Unsupported/);
  assert.equal(owner.state.metadata.validity.status, "valid");
  owner.dispose();
});
test("catalog replace rejects identity mutation and malformed ranges without state or event publication", async () => {
  const raw = def("table", {
    entries: [{ minimum: 1, maximum: 2, value: { result: "find" }, weight: 0 }],
  });
  const owner = TableDefinition.deserializePayload(raw);
  const states = [],
    events = [];
  const sub = owner.state$.subscribe((s) => states.push(s));
  owner.events.replaced.listen((e) => events.push(e));
  await assert.rejects(
    owner.command(
      "replace",
      invoke({ ...raw, identity: { ...raw.identity, id: "other" } }),
    ),
    /identity/,
  );
  assert.equal(
    (
      await owner.command(
        "replace",
        invoke({
          ...raw,
          components: { entries: [{ minimum: 3, maximum: 1, value: null }] },
        }),
      )
    ).status,
    "rejected",
  );
  assert.equal(states.length, 1);
  assert.equal(events.length, 0);
  const next = {
    ...raw,
    components: {
      ...raw.components,
      imported: "kept",
      entries: [{ minimum: 1, maximum: 2, value: null }],
    },
  };
  assert.equal(
    (await owner.command("replace", invoke(next))).status,
    "committed",
  );
  assert.deepEqual(owner.serializePayload().extensions, raw.extensions);
  assert.equal(events.length, 1);
  sub.unsubscribe();
  owner.dispose();
});
test("custom schema binding is exact, unresolved drafts survive and mismatches block publication", async () => {
  const raw = def("custom", {
    definitionKind: "story:weather",
    schemaId: "schema",
    data: { temperature: 5 },
  });
  const draft = CustomDefinition.deserializePayload(raw, { mode: "draft" });
  assert.equal(draft.state.metadata.validity.status, "unresolved");
  assert.equal(
    (await draft.command("replace", invoke({ ...raw, imported: [2] }))).status,
    "committed",
  );
  draft.validate({ mode: "publication", records: [] });
  assert.equal(draft.state.metadata.validity.status, "invalid");
  const capture = [
    {
      resourceType: "extension-schemas",
      sourceId: "schema",
      payload: schema(),
    },
  ];
  draft.validate({ mode: "publication", records: capture });
  assert.equal(draft.state.metadata.validity.status, "valid");
  draft.validate({
    mode: "publication",
    records: [{ ...capture[0], payload: { ...schema(), appliesTo: ["item"] } }],
  });
  assert.equal(draft.state.metadata.validity.status, "invalid");
  draft.dispose();
});
test("independent schema, pack and variant roots retain owned values and validate local structure", () => {
  const roots = [
    ExtensionSchema.deserializePayload(schema()),
    RuleVariant.deserializePayload(
      variant("optional", {
        rulePatches: [{ target: "path", operation: "remove", private: 7 }],
      }),
    ),
    ContentPack.deserializePayload({
      id: "pack",
      namespace: "story",
      name: "Story",
      version: "any-authored-version",
      edition: "homebrew:story",
      source,
      definitionIds: [],
      extensionSchemas: [schema()],
      dependencies: [
        { namespace: "optional", versionRange: "authored", optional: true },
      ],
    }),
  ];
  for (const owner of roots) {
    assert.equal(owner.state.metadata.validity.status, "valid");
    assert.deepEqual(
      owner.constructor.deserialize(owner.serialize()).serializePayload(),
      owner.serializePayload(),
    );
    owner.dispose();
  }
  const invalid = RuleVariant.deserializePayload(
    variant("bad", { rulePatches: [{ target: "x", operation: "unknown" }] }),
  );
  assert.ok(
    invalid.state.metadata.validity.issues.some(
      (i) => i.code === "catalog-variant-patches",
    ),
  );
  invalid.dispose();
});
test("GameSystem adoption validates closed catalog selection atomically and keeps source immutable", async () => {
  const raw = {
    id: "system",
    name: "System",
    editions: ["homebrew:story"],
    engineSchemaVersion: "1",
    catalog: {
      definitions: [def("language")],
      variants: [
        variant("base"),
        variant("dependent", { requires: ["base"] }),
        variant("conflict", { conflictsWith: ["base"] }),
      ],
      packs: [],
    },
    enabledVariantIds: ["base"],
    configuration: { secret: { preserved: true } },
    imported: true,
  };
  const owner = GameSystem.deserializePayload(raw, { mode: "publication" });
  assert.equal(owner.state.metadata.validity.status, "valid");
  const select = (ids) =>
    owner.command("setEnabledVariants", {
      initiator: "gm",
      params: { ids },
      context: {},
    });
  assert.equal((await select(["dependent"])).status, "rejected");
  assert.equal((await select(["base", "conflict"])).status, "rejected");
  assert.equal((await select(["missing"])).status, "rejected");
  assert.deepEqual(owner.serializePayload().enabledVariantIds, ["base"]);
  assert.equal((await select(["base", "dependent"])).status, "committed");
  assert.deepEqual(owner.serializePayload().configuration, raw.configuration);
  assert.deepEqual(raw.enabledVariantIds, ["base"]);
  owner.dispose();
});

test("table dice grammar reuses authored syntax without imposing integer ranges or positive weights", () => {
  const raw = def("table", {
    roll: { terms: [{ kind: "dice", count: 1, size: 6 }] },
    entries: [{ minimum: -2.5, maximum: 1.5, value: "outcome", weight: -1 }],
  });
  const owner = TableDefinition.deserializePayload(raw);
  assert.equal(owner.state.metadata.validity.status, "valid");
  const malformed = TableDefinition.deserializePayload({
    ...raw,
    components: {
      ...raw.components,
      roll: { terms: [{ kind: "dice", count: 1 }] },
    },
  });
  assert.ok(
    malformed.state.metadata.validity.issues.some(
      (i) => i.path === "components.roll.terms[0].size",
    ),
  );
  owner.dispose();
  malformed.dispose();
});

test("Custom ambiguous schema keys require an explicit identity at publication", async () => {
  const raw = def("custom", {
    definitionKind: "story:weather",
    data: { authored: true },
  });
  const records = [
    schema(),
    { ...schema(), id: "schema-v2", semanticVersion: "2" },
  ].map((payload) => ({
    resourceType: "extension-schemas",
    sourceId: payload.id,
    payload,
  }));
  const owner = CustomDefinition.deserializePayload(raw, {
    mode: "publication",
    records,
  });
  assert.ok(
    owner.state.metadata.validity.issues.some(
      (issue) => issue.code === "catalog-custom-ambiguous" && issue.blocking,
    ),
  );
  assert.equal(
    (
      await owner.command(
        "replace",
        invoke({
          ...raw,
          components: { ...raw.components, schemaId: "schema-v2" },
        }),
      )
    ).status,
    "committed",
  );
  assert.equal(owner.state.metadata.validity.status, "valid");
  const draft = CustomDefinition.deserializePayload(raw, {
    mode: "draft",
    records,
  });
  assert.equal(
    (await draft.command("replace", invoke({ ...raw, imported: true }))).status,
    "committed",
  );
  assert.equal(draft.state.metadata.validity.status, "unresolved");
  owner.dispose();
  draft.dispose();
});
test("ContentPack requires captured dependency namespaces but never solves authored version ranges", async () => {
  const raw = {
    id: "pack",
    namespace: "story",
    name: "Story",
    version: "1",
    edition: "homebrew:story",
    source,
    definitionIds: [],
    dependencies: [
      { namespace: "base", versionRange: "arbitrary authored range" },
      { namespace: "optional", versionRange: "*", optional: true },
    ],
  };
  const draft = ContentPack.deserializePayload(raw, { mode: "draft" });
  assert.equal(draft.state.metadata.validity.status, "unresolved");
  assert.equal(
    (await draft.command("replace", invoke({ ...raw, name: "Changed" })))
      .status,
    "committed",
  );
  draft.validate({ mode: "publication", records: [] });
  assert.deepEqual(
    draft.state.metadata.validity.issues.map((issue) => issue.code),
    ["catalog-pack-dependency-missing"],
  );
  draft.validate({
    mode: "publication",
    records: [
      {
        resourceType: "content-packs",
        sourceId: "base-pack",
        payload: {
          ...raw,
          id: "base-pack",
          namespace: "base",
          version: "unrelated",
          dependencies: [],
        },
      },
    ],
  });
  assert.equal(draft.state.metadata.validity.status, "valid");
  draft.dispose();
});
