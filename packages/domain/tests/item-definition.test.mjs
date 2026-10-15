import assert from "node:assert/strict";
import test from "node:test";
import {
  ItemDefinition,
  TraitDefinition,
  ActionDefinition,
} from "../dist/index.js";

const input = () => ({
  name: " Brass key ",
  itemFamilyKey: "world:tool",
  category: "tool",
  quality: "standard",
  compatibleEquipmentSlotSets: [["world:hand"]],
  weight: { value: 0.1, unit: "kilogram" },
  cost: [{ amount: 2, denomination: "Credits" }],
});
const conformance = () => ({
  conceptId: "item-concept",
  modelSchemaReleaseIds: ["model-release"],
});
const payload = () =>
  ItemDefinition.authorPayload("item", input(), conformance());
const context = () => ({
  sourceId: "item",
  mode: "publication",
  records: [],
  model: {
    releaseIds: ["model-release"],
    elements: [
      {
        id: "item-concept",
        key: "world:item",
        kind: "concept",
        semanticRole: "aow:item",
      },
      {
        id: "tool-family",
        key: "world:tool",
        kind: "option",
        semanticRole: "aow:item-family",
      },
      {
        id: "hand-slot",
        key: "world:hand",
        kind: "option",
        semanticRole: "aow:equipment-slot",
      },
    ],
  },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);

test("Item authoring selection decoding retains bounded vocabulary and diagnostic behavior", () => {
  const vocabulary = {
    itemFamilies: ["world:tool"],
    equipmentSlots: ["world:hand"],
  };
  const selection = {
    ...input(),
    itemFamilyKey: " world:tool ",
    category: " tool ",
  };
  assert.deepEqual(
    ItemDefinition.decodeAuthoringSelection(selection, vocabulary),
    {
      itemFamilyKey: "world:tool",
      category: "tool",
      quality: "standard",
      compatibleEquipmentSlotSets: [["world:hand"]],
    },
  );
  for (const [patch, message] of [
    [{ itemFamilyKey: "world:foreign" }, /unavailable Item family/],
    [{ quality: "unknown" }, /invalid quality/],
    [{ category: "" }, /omitted category/],
    [
      { compatibleEquipmentSlotSets: [["world:other"]] },
      /unavailable Equipment Slot/,
    ],
    [
      { compatibleEquipmentSlotSets: [["world:hand", "world:hand"]] },
      /duplicate Equipment Slot/,
    ],
  ])
    assert.throws(
      () =>
        ItemDefinition.decodeAuthoringSelection(
          { ...selection, ...patch },
          vocabulary,
        ),
      message,
    );
});

test("Item round trips existing payload and extensions without persisting validity or observers", () => {
  const data = payload();
  data.identity.description = "Private provenance";
  data.components.futureField = { kept: [1, 2] };
  data.extensions = { "world:custom": { note: "retained" } };
  const item = ItemDefinition.deserialize(data, context());
  assert.equal(item.state.metadata.validity.status, "valid");
  const encoded = item.serialize();
  assert.deepEqual(Object.keys(encoded).sort(), [
    "data",
    "schemaVersion",
    "type",
  ]);
  assert.deepEqual(
    ItemDefinition.deserialize(encoded, context()).serializePayload(),
    data,
  );
  encoded.data.components.futureField.kept.push(3);
  assert.deepEqual(item.state.data.components.futureField.kept, [1, 2]);
});

test("Item construction preserves legacy archive, image and unknown components while clearing equipped slots", () => {
  const old = {
    name: "Old key",
    key: "world:old-key",
    image: { assetId: "image" },
    components: {
      notes: "Private notes",
      equippable: { compatibleSlotSets: [["world:hand"]] },
      futureField: 7,
    },
    extensions: { "world:custom": "kept" },
  };
  const result = ItemDefinition.authorPayload(
    "item",
    { ...input(), compatibleEquipmentSlotSets: [] },
    conformance(),
    old,
  );
  assert.deepEqual(result.extensions["aow:legacy-item"], old);
  assert.equal(result.extensions["world:custom"], "kept");
  assert.deepEqual(result.image, old.image);
  assert.equal(result.components.futureField, 7);
  assert.equal(result.components.notes, "Private notes");
  assert.equal(result.components.equippable, undefined);
  assert.equal(result.identity.name, "Brass key");
});

test("Item draft legacy scalar issues remain visible but only unchanged values are nonblocking", () => {
  for (const [field, invalid] of [
    ["weight", { value: -1, unit: "kilogram" }],
    ["cost", "legacy cost"],
    ["notes", 12],
  ]) {
    const prior = payload();
    prior.components[field] = invalid;
    const item = ItemDefinition.deserialize(prior, {
      ...context(),
      mode: "draft",
      baseline: prior,
    });
    const issue = item.state.metadata.validity.issues.find(
      (i) => i.code === `item-codex-${field}`,
    );
    assert.equal(issue.blocking, false);
    assert.equal(item.state.metadata.validity.status, "invalid");
    const states = [];
    const sub = item.state$.subscribe((state) => states.push(state));
    item.validate({ ...context(), baseline: prior });
    assert.equal(
      item.state.metadata.validity.issues.find((i) => i.code === issue.code)
        .blocking,
      true,
    );
    assert.equal(states.length, 2);
    sub.unsubscribe();
  }
  const prior = payload();
  prior.components.weight = { value: -1, unit: "kilogram" };
  const edited = structuredClone(prior);
  edited.components.weight.value = -2;
  assert.equal(
    ItemDefinition.deserialize(edited, {
      ...context(),
      mode: "draft",
      baseline: prior,
    }).state.metadata.validity.issues.find(
      (i) => i.code === "item-codex-weight",
    ).blocking,
    true,
  );
});

test("Item validation enforces square artwork and slot-set structure while allowing absent artwork", () => {
  assert.equal(
    ItemDefinition.deserialize(payload(), context()).state.metadata.validity
      .status,
    "valid",
  );
  for (const patch of [
    {
      image: {
        assetId: "image",
        altText: "Key",
        width: 50,
        height: 100,
        mimeType: "image/png",
      },
    },
    {
      components: {
        ...payload().components,
        equippable: { compatibleSlotSets: [[]] },
      },
    },
    { components: { ...payload().components, quality: "unknown" } },
  ])
    assert(
      codes(
        ItemDefinition.deserialize({ ...payload(), ...patch }, context()),
      ).includes("item-canonical-components"),
    );
});

test("Item granted Conditions are checked against the provided World capture", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  assert(
    codes(ItemDefinition.deserialize(data, context())).includes(
      "item-codex-conditions",
    ),
  );
  const scoped = {
    ...context(),
    records: [
      {
        resourceType: "world-conditions",
        sourceId: "condition",
        payload: { id: "condition" },
      },
    ],
  };
  assert(
    !codes(ItemDefinition.deserialize(data, scoped)).includes(
      "item-codex-conditions",
    ),
  );
  data.components.grantedConditions.push({ conditionId: "condition" });
  assert(
    codes(ItemDefinition.deserialize(data, scoped)).includes(
      "item-codex-conditions",
    ),
  );
});

test("Item Model validates exact releases, concept, family and equipment-slot membership", () => {
  for (const alter of [
    (data) => {
      data.conformance.modelSchemaReleaseIds = ["other"];
    },
    (data) => {
      data.conformance.conceptId = "tool-family";
    },
    (data) => {
      data.modelValues["aow:item-family"] = "world:foreign";
    },
    (data) => {
      data.components.equippable.compatibleSlotSets = [["world:foreign"]];
    },
    (data) => {
      data.components.equippable.compatibleSlotSets = [
        ["world:hand"],
        ["world:hand"],
      ];
    },
  ]) {
    const data = payload();
    alter(data);
    assert(
      codes(ItemDefinition.deserialize(data, context())).includes(
        "item-model-invalid",
      ),
    );
  }
  assert.equal(
    ItemDefinition.deserialize(payload()).state.metadata.validity.status,
    "unresolved",
  );
  assert(
    codes(
      ItemDefinition.deserialize(payload(), { ...context(), model: undefined }),
    ).includes("item-model-unresolved"),
  );
});

test("Item rename publishes immutable state before its event and rejects invalid candidate state", async () => {
  const item = ItemDefinition.deserialize(payload(), context());
  const order = [];
  item.state$.subscribe((state) => order.push(state.data.identity.name));
  item.events.renamed.listen((event) => {
    order.push(event.context.name);
    assert(Object.isFrozen(event.context));
  });
  const invoke = {
    initiator: "author",
    params: { name: " Silver key " },
    context: {},
  };
  assert.equal((await item.command("rename", invoke)).status, "committed");
  assert.deepEqual(order, ["Brass key", "Silver key", "Silver key"]);
  assert.equal((await item.command("rename", invoke)).status, "unchanged");
  assert.equal(order.length, 3);
  const data = payload();
  data.components.weight.value = -1;
  const invalid = ItemDefinition.deserialize(data, context());
  assert.equal((await invalid.command("rename", invoke)).status, "rejected");
  assert.equal(invalid.state.data.identity.name, "Brass key");
});

test("Item decoding rejects malformed input and unsupported versions but exposes incomplete draft validity", () => {
  for (const input of [
    null,
    { kind: "creature" },
    { kind: "item", field: Infinity },
    { type: "item-definition", schemaVersion: 2, data: payload() },
  ])
    assert.throws(() => ItemDefinition.deserialize(input), /Item|schema|JSON/i);
  assert.notEqual(
    ItemDefinition.deserialize({ kind: "item" }).state.metadata.validity.status,
    "valid",
  );
});

const ownedTrait = (components = {}) => ({
  kind: "trait",
  identity: { id: "key-trait", name: "Masterwork mechanism" },
  components,
  extensions: { "world:private": { provenance: "Secret workshop" } },
});
const withTraits = (traits) => ({
  ...payload(),
  components: { ...payload().components, traits },
});

test("Item permits absent, empty, one and many Traits and preserves detached owned payloads", () => {
  for (const data of [
    payload(),
    withTraits([]),
    withTraits([ownedTrait()]),
    withTraits([
      ownedTrait(),
      ownedTrait({
        actions: [
          {
            kind: "action",
            components: { activation: "reaction", outcomes: [] },
          },
        ],
      }),
    ]),
  ]) {
    const original = structuredClone(data);
    const entity = ItemDefinition.deserializePayload(data, context());
    assert.equal(entity.state.metadata.validity.status, "valid");
    if (data.components.traits?.length)
      data.components.traits[0].extensions["world:private"].provenance =
        "Changed source";
    assert.deepEqual(entity.serializePayload(), original);
    const envelope = entity.serialize();
    const restored = ItemDefinition.deserialize(envelope, context());
    assert.deepEqual(restored.serializePayload(), original);
    if (envelope.data.components.traits?.length)
      envelope.data.components.traits[0].components.changed = true;
    assert.deepEqual(entity.serializePayload(), original);
    assert.deepEqual(restored.serializePayload(), original);
    restored.dispose();
    entity.dispose();
  }
});

test("Item reports malformed supplied Traits without discarding later child diagnostics", () => {
  for (const traits of [null, {}, "legacy"]) {
    const entity = ItemDefinition.deserializePayload(
      withTraits(traits),
      context(),
    );
    assert.equal(
      entity.state.metadata.validity.issues.find(
        (issue) => issue.code === "item-traits-invalid",
      ).path,
      "components.traits",
    );
    entity.dispose();
  }
  const data = withTraits([
    null,
    { kind: "action" },
    ownedTrait({
      actions: [
        { kind: "action", components: { activation: "typo", outcomes: [] } },
      ],
    }),
  ]);
  const entity = ItemDefinition.deserializePayload(data, {
    ...context(),
    records: undefined,
  });
  assert.deepEqual(
    entity.state.metadata.validity.issues
      .filter((issue) => issue.code.startsWith("item-traits-"))
      .map(({ code, path }) => ({ code, path })),
    [
      { code: "item-traits-invalid", path: "components.traits[0]" },
      { code: "item-traits-invalid", path: "components.traits[1]" },
      {
        code: "item-traits-trait-actions-action-components-invalid",
        path: "components.traits[2].components.actions[0].components",
      },
    ],
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item inherits incomplete Trait and nested Action state", () => {
  for (const trait of [
    { kind: "trait" },
    ownedTrait({ actions: [{ kind: "action" }] }),
  ]) {
    const entity = ItemDefinition.deserializePayload(
      withTraits([trait]),
      context(),
    );
    assert.equal(entity.state.metadata.validity.status, "unresolved");
    const issue = entity.state.metadata.validity.issues[0];
    assert.equal(issue.unresolved, true);
    assert.ok(issue.code.startsWith("item-traits-"));
    assert.ok(issue.path.startsWith("components.traits[0].components"));
    entity.dispose();
  }
});

test("Item revalidates owned references with scoped context and disposes temporary Traits and Actions", (t) => {
  const data = withTraits([
    ownedTrait({
      actions: [
        {
          kind: "action",
          components: {
            activation: "reaction",
            outcomes: [],
            grantedConditions: [{ conditionId: "condition" }],
          },
        },
      ],
    }),
  ]);
  const children = [];
  const contexts = [];
  for (const Definition of [TraitDefinition, ActionDefinition]) {
    const deserialize = Definition.deserializePayload;
    t.mock.method(Definition, "deserializePayload", function (value, context) {
      contexts.push(context);
      const child = deserialize.call(this, value, context);
      const tracker = { completed: false };
      child.state$.subscribe({
        complete: () => {
          tracker.completed = true;
        },
      });
      children.push(tracker);
      return child;
    });
  }
  const entity = ItemDefinition.deserializePayload(data, {
    ...context(),
    records: undefined,
    baseline: data,
  });
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  const states = [];
  const subscription = entity.state$.subscribe((state) => states.push(state));
  entity.validate(context());
  assert.equal(entity.state.metadata.validity.status, "invalid");
  assert.deepEqual(codes(entity), [
    "item-traits-trait-actions-action-codex-granted-conditions",
  ]);
  const records = [
    { resourceType: "world-conditions", sourceId: "condition", payload: {} },
  ];
  entity.validate({ ...context(), records, baseline: data });
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.equal(states.length, 3);
  assert.ok(
    contexts.every((value) =>
      Object.keys(value).every((key) => ["mode", "records"].includes(key)),
    ),
  );
  for (const value of contexts.slice(-2)) {
    assert.equal(value.mode, "publication");
    assert.deepEqual(value.records, records);
    assert.notEqual(value.records, records);
  }
  assert.equal(children.length, 6);
  assert.ok(children.every((child) => child.completed));
  assert.deepEqual(entity.serializePayload(), data);
  subscription.unsubscribe();
  entity.dispose();
});

test("Item rename atomically rejects invalid or unresolved owned Traits", async () => {
  for (const trait of [
    ownedTrait({
      actions: [
        { kind: "action", components: { activation: "typo", outcomes: [] } },
      ],
    }),
    { kind: "trait" },
  ]) {
    const data = withTraits([trait]);
    const entity = ItemDefinition.deserializePayload(data, context());
    const before = entity.state;
    const states = [];
    const events = [];
    entity.state$.subscribe((state) => states.push(state));
    entity.events.renamed.listen((event) => events.push(event));
    const receipt = await entity.command("rename", {
      initiator: "author",
      params: { name: "Silver key" },
      context: {},
    });
    assert.equal(receipt.status, "rejected");
    assert.equal(entity.state, before);
    assert.equal(states.length, 1);
    assert.deepEqual(events, []);
    assert.deepEqual(entity.serializePayload(), data);
    entity.dispose();
  }
});

test("Item retains deeply nested legacy Trait content when the child codec cannot hydrate it", () => {
  let deep = {};
  for (let i = 0; i < 66; i++) deep = { nested: deep };
  const data = withTraits([{ ...ownedTrait(), extra: deep }]);
  const entity = ItemDefinition.deserializePayload(data, context());
  assert.equal(entity.state.metadata.validity.status, "invalid");
  assert.deepEqual(codes(entity), ["item-traits-invalid"]);
  assert.equal(
    entity.state.metadata.validity.issues[0].path,
    "components.traits[0]",
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

const ownedAction = (components = {}) => ({
  kind: "action",
  identity: { id: "signal-action", name: "Sound the signal" },
  components: { activation: "action", outcomes: [], ...components },
  extensions: { "world:private": { instructions: "Secret signal" } },
});
const vehicle = (actions) => ({
  vehicleType: "waterborne",
  size: "large",
  armorClass: 15,
  hitPoints: 50,
  speeds: {},
  ...(actions === undefined ? {} : { actions }),
});
const withActions = (actions, vehicleActions) => ({
  ...payload(),
  components: {
    ...payload().components,
    ...(actions === undefined ? {} : { actions }),
    vehicle: vehicle(vehicleActions),
  },
});
const actionIssues = (entity) =>
  entity.state.metadata.validity.issues.filter(
    (issue) =>
      issue.code.startsWith("item-actions-") ||
      issue.code.startsWith("item-vehicle-actions-"),
  );

test("Item owns absent, empty, one and multiple direct and Vehicle Actions without changing persisted content", () => {
  for (const data of [
    payload(),
    withActions(),
    withActions([], []),
    withActions([ownedAction()]),
    withActions(undefined, [ownedAction()]),
    withActions([ownedAction(), ownedAction()], [ownedAction(), ownedAction()]),
  ]) {
    const original = structuredClone(data);
    const entity = ItemDefinition.deserializePayload(data, context());
    assert.equal(entity.state.metadata.validity.status, "valid");
    if (data.components.actions?.length)
      data.components.actions[0].extensions["world:private"].instructions =
        "Edited";
    assert.deepEqual(entity.serializePayload(), original);
    const encoded = entity.serialize();
    const restored = ItemDefinition.deserialize(encoded, context());
    if (encoded.data.components.vehicle?.actions?.length)
      encoded.data.components.vehicle.actions[0].components.activation =
        "invalid";
    assert.deepEqual(restored.serializePayload(), original);
    assert.deepEqual(entity.serializePayload(), original);
    restored.dispose();
    entity.dispose();
  }
});

test("Item diagnoses malformed direct and Vehicle Action containers and every malformed member", () => {
  for (const value of [null, "legacy", {}]) {
    const entity = ItemDefinition.deserializePayload(
      withActions(value, value),
      context(),
    );
    assert.deepEqual(
      actionIssues(entity).map(({ code, path }) => ({ code, path })),
      [
        { code: "item-actions-invalid", path: "components.actions" },
        {
          code: "item-vehicle-actions-invalid",
          path: "components.vehicle.actions",
        },
      ],
    );
    entity.dispose();
  }
  for (const value of [null, "legacy", []]) {
    const data = withActions();
    data.components.vehicle = value;
    const entity = ItemDefinition.deserializePayload(data, context());
    assert.equal(actionIssues(entity)[0].path, "components.vehicle");
    assert.equal(actionIssues(entity)[0].code, "item-vehicle-actions-invalid");
    entity.dispose();
  }
  const data = withActions(
    [null, { kind: "trait" }, ownedAction({ activation: "invalid" })],
    [12, ownedAction({ outcomes: "invalid" })],
  );
  const entity = ItemDefinition.deserializePayload(data, {
    ...context(),
    records: undefined,
  });
  assert.deepEqual(
    actionIssues(entity).map(({ code, path }) => ({ code, path })),
    [
      { code: "item-actions-invalid", path: "components.actions[0]" },
      { code: "item-actions-invalid", path: "components.actions[1]" },
      {
        code: "item-actions-action-components-invalid",
        path: "components.actions[2].components",
      },
      {
        code: "item-vehicle-actions-invalid",
        path: "components.vehicle.actions[0]",
      },
      {
        code: "item-vehicle-actions-action-components-invalid",
        path: "components.vehicle.actions[1].components",
      },
    ],
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item aggregates unresolved Actions and accepts repaired authoring payloads", () => {
  const data = withActions([{ kind: "action" }], [{ kind: "action" }]);
  const entity = ItemDefinition.deserializePayload(data, context());
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  assert.ok(actionIssues(entity).every((issue) => issue.unresolved));
  assert.equal(actionIssues(entity).length, 2);
  const repaired = entity.serializePayload();
  repaired.components.actions[0].components = ownedAction().components;
  repaired.components.vehicle.actions[0].components = ownedAction().components;
  const restored = ItemDefinition.deserializePayload(repaired, context());
  assert.equal(restored.state.metadata.validity.status, "valid");
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  restored.dispose();
  entity.dispose();
});

test("Item revalidates both Action lists against copied capture context and disposes each temporary child", (t) => {
  const action = ownedAction({
    grantedConditions: [{ conditionId: "condition" }],
  });
  const data = withActions([action], [action]);
  const contexts = [];
  const children = [];
  const deserialize = ActionDefinition.deserializePayload;
  t.mock.method(
    ActionDefinition,
    "deserializePayload",
    function (value, childContext) {
      contexts.push(childContext);
      const child = deserialize.call(this, value, childContext);
      const tracker = { completed: false };
      child.state$.subscribe({
        complete: () => {
          tracker.completed = true;
        },
      });
      children.push(tracker);
      return child;
    },
  );
  const entity = ItemDefinition.deserializePayload(data, {
    ...context(),
    records: undefined,
    baseline: data,
  });
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  const states = [];
  entity.state$.subscribe((state) => states.push(state));
  entity.validate(context());
  assert.equal(entity.state.metadata.validity.status, "invalid");
  assert.deepEqual(codes(entity), [
    "item-actions-action-codex-granted-conditions",
    "item-vehicle-actions-action-codex-granted-conditions",
  ]);
  const records = [
    { resourceType: "world-conditions", sourceId: "condition", payload: {} },
  ];
  entity.validate({ ...context(), records, baseline: data });
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.equal(states.length, 3);
  assert.equal(children.length, 6);
  assert.ok(children.every((child) => child.completed));
  assert.ok(
    contexts.every((value) =>
      Object.keys(value).every((key) => ["mode", "records"].includes(key)),
    ),
  );
  for (const value of contexts.slice(-2)) {
    assert.equal(value.mode, "publication");
    assert.deepEqual(value.records, records);
    assert.notEqual(value.records, records);
  }
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item rejects rename atomically for invalid or unresolved direct and Vehicle Actions", async () => {
  for (const action of [
    ownedAction({ activation: "invalid" }),
    { kind: "action" },
  ]) {
    for (const data of [
      withActions([action]),
      withActions(undefined, [action]),
    ]) {
      const entity = ItemDefinition.deserializePayload(data, context());
      const before = entity.state;
      const states = [];
      const events = [];
      entity.state$.subscribe((state) => states.push(state));
      entity.events.renamed.listen((event) => events.push(event));
      const receipt = await entity.command("rename", {
        initiator: "author",
        params: { name: "Silver key" },
        context: {},
      });
      assert.equal(receipt.status, "rejected");
      assert.equal(entity.state, before);
      assert.equal(states.length, 1);
      assert.deepEqual(events, []);
      assert.deepEqual(entity.serializePayload(), data);
      entity.dispose();
    }
  }
});

test("Item preserves deep Action extensions when child codecs reject their bounds", () => {
  let deep = {};
  for (let index = 0; index < 66; index++) deep = { nested: deep };
  const action = { ...ownedAction(), extra: deep };
  const data = withActions([action, ownedAction()], [action, ownedAction()]);
  const entity = ItemDefinition.deserializePayload(data, context());
  assert.deepEqual(
    actionIssues(entity).map(({ code, path }) => ({ code, path })),
    [
      { code: "item-actions-invalid", path: "components.actions[0]" },
      {
        code: "item-vehicle-actions-invalid",
        path: "components.vehicle.actions[0]",
      },
    ],
  );
  assert.deepEqual(entity.serializePayload(), data);
  const restored = ItemDefinition.deserialize(entity.serialize(), context());
  assert.deepEqual(restored.serializePayload(), data);
  restored.dispose();
  entity.dispose();
});

const withVehicle = (value) => ({
  ...payload(),
  components: { ...payload().components, vehicle: value },
});
const vehicleIssues = (entity) =>
  entity.state.metadata.validity.issues.filter((issue) =>
    issue.code.startsWith("item-vehicle-"),
  );

test("Item accepts the complete Vehicle value contract and preserves open vocabulary and private content", () => {
  const complete = {
    ...vehicle([ownedAction()]),
    vehicleType: "world:submarine",
    size: "world:colossal",
    armorClass: -1.5,
    hitPoints: -2.5,
    damageThreshold: -3.5,
    crew: -4.5,
    passengers: -5.5,
    cargoCapacity: {
      value: -6.5,
      unit: "kilogram",
      private: { retained: true },
    },
    speeds: Object.fromEntries(
      ["foot", "mile", "square", "hex", "meter", "kilometer"].map((unit) => [
        unit,
        { value: -0.5, unit },
      ]),
    ),
    components: ["captured-component", "captured-component"],
    private: { notes: ["Secret hull"] },
  };
  const data = withVehicle(complete);
  const vehicleContext = {
    ...context(),
    definitionIds: ["captured-component"],
    records: [
      {
        resourceType: "definitions",
        sourceId: "captured-component",
        payload: { kind: "action" },
      },
    ],
  };
  const entity = ItemDefinition.deserializePayload(data, vehicleContext);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const original = structuredClone(data);
  data.components.vehicle.private.notes.push("Changed");
  const restored = ItemDefinition.deserialize(
    JSON.parse(JSON.stringify(entity.serialize())),
    context(),
  );
  assert.deepEqual(restored.serializePayload(), original);
  assert.deepEqual(entity.serializePayload(), original);
  restored.dispose();
  entity.dispose();
  for (const unit of ["pound", "ounce", "kilogram"]) {
    const item = ItemDefinition.deserializePayload(
      withVehicle({
        ...vehicle(),
        cargoCapacity: { value: 0, unit },
        vehicleType: "",
        size: "",
        components: [],
      }),
      context(),
    );
    assert.equal(item.state.metadata.validity.status, "valid");
    item.dispose();
  }
});

test("Item records every missing required Vehicle field as unresolved and still validates Actions", () => {
  const entity = ItemDefinition.deserializePayload(
    withVehicle({ actions: [ownedAction({ activation: "bad" })] }),
    context(),
  );
  assert.deepEqual(
    vehicleIssues(entity)
      .filter((issue) => issue.unresolved)
      .map(({ code, path }) => ({ code, path })),
    ["vehicleType", "size", "armorClass", "hitPoints", "speeds"].map(
      (field) => ({
        code: "item-vehicle-unresolved",
        path: `components.vehicle.${field}`,
      }),
    ),
  );
  assert.ok(
    codes(entity).includes("item-vehicle-actions-action-components-invalid"),
  );
  // Entity gives unresolved context precedence while retaining blocking Action diagnostics.
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  entity.dispose();
  const missing = ItemDefinition.deserializePayload(withVehicle({}), context());
  assert.equal(missing.state.metadata.validity.status, "unresolved");
  missing.dispose();
});

test("Item diagnoses supplied malformed Vehicle scalar, quantity, map and reference fields at their paths", () => {
  const cases = [
    ["vehicleType", 1, "vehicleType"],
    ["size", {}, "size"],
    ...[
      "armorClass",
      "hitPoints",
      "damageThreshold",
      "crew",
      "passengers",
    ].flatMap((field) => [
      [field, "1", field],
      [field, null, field],
    ]),
    ["cargoCapacity", [], "cargoCapacity"],
    ["cargoCapacity", { value: "1", unit: "pound" }, "cargoCapacity.value"],
    ["cargoCapacity", { value: 1, unit: "ton" }, "cargoCapacity.unit"],
    ["cargoCapacity", { value: 1, unit: ["pound"] }, "cargoCapacity.unit"],
    ["speeds", [], "speeds"],
    ["speeds", { sail: null }, 'speeds["sail"]'],
    ["speeds", { sail: { value: "1", unit: "foot" } }, 'speeds["sail"].value'],
    ["speeds", { sail: { value: 1, unit: "yard" } }, 'speeds["sail"].unit'],
    ["speeds", { sail: { value: 1, unit: ["foot"] } }, 'speeds["sail"].unit'],
    ["components", "legacy", "components"],
    ["components", ["valid", 42], "components[1]"],
  ];
  for (const [field, value, path] of cases) {
    const data = withVehicle({ ...vehicle(), [field]: value });
    const entity = ItemDefinition.deserializePayload(data, context());
    assert.deepEqual(
      vehicleIssues(entity)
        .filter((issue) => !issue.unresolved)
        .map(({ code, path }) => ({ code, path })),
      [{ code: "item-vehicle-invalid", path: `components.vehicle.${path}` }],
    );
    assert.deepEqual(entity.serializePayload(), data);
    entity.dispose();
  }
  for (const field of [
    "armorClass",
    "hitPoints",
    "damageThreshold",
    "crew",
    "passengers",
  ])
    for (const value of [Infinity, -Infinity, NaN])
      assert.throws(
        () =>
          ItemDefinition.deserializePayload(
            withVehicle({ ...vehicle(), [field]: value }),
            context(),
          ),
        /JSON/i,
      );
});

test("Item distinguishes incomplete Vehicle quantities from malformed values and aggregates all diagnostics", () => {
  const data = withVehicle({
    ...vehicle([null]),
    armorClass: "bad",
    cargoCapacity: {},
    speeds: { sail: { value: null }, fly: {} },
    components: [false, null],
  });
  const entity = ItemDefinition.deserializePayload(data, context());
  const issues = vehicleIssues(entity);
  assert.deepEqual(
    issues.filter((issue) => issue.unresolved).map((issue) => issue.path),
    [
      "components.vehicle.cargoCapacity.value",
      "components.vehicle.cargoCapacity.unit",
      'components.vehicle.speeds["sail"].unit',
      'components.vehicle.speeds["fly"].value',
      'components.vehicle.speeds["fly"].unit',
    ],
  );
  assert.deepEqual(
    issues.filter((issue) => !issue.unresolved).map((issue) => issue.path),
    [
      "components.vehicle.armorClass",
      'components.vehicle.speeds["sail"].value',
      "components.vehicle.components[0]",
      "components.vehicle.components[1]",
      "components.vehicle.actions[0]",
    ],
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item rejects rename for invalid and incomplete Vehicle values atomically and accepts repaired payloads", async () => {
  for (const value of [{}, { ...vehicle(), passengers: "bad" }]) {
    const data = withVehicle(value);
    const entity = ItemDefinition.deserializePayload(data, context());
    const before = entity.state;
    const states = [];
    const events = [];
    entity.state$.subscribe((state) => states.push(state));
    entity.events.renamed.listen((event) => events.push(event));
    const invocation = {
      initiator: "author",
      params: { name: "Silver vessel" },
      context: {},
    };
    assert.equal(
      (await entity.command("rename", invocation)).status,
      "rejected",
    );
    assert.equal(entity.state, before);
    assert.equal(states.length, 1);
    assert.deepEqual(events, []);
    const repaired = entity.serializePayload();
    repaired.components.vehicle = vehicle();
    const restored = ItemDefinition.deserializePayload(repaired, context());
    assert.equal(
      (await restored.command("rename", invocation)).status,
      "committed",
    );
    assert.equal(restored.state.data.identity.name, "Silver vessel");
    assert.deepEqual(entity.serializePayload(), data);
    restored.dispose();
    entity.dispose();
  }
});

test("Item structured edits preserve omitted sections and explicitly replace or remove owned content", () => {
  const prior = {
    ...payload(),
    components: {
      ...payload().components,
      traits: [ownedTrait({ actions: [ownedAction()] })],
      actions: [ownedAction()],
      vehicle: { ...vehicle([ownedAction()]), privateNotes: "GM only" },
      crafting: { privateNotes: "Keep recipe" },
    },
  };
  const unchanged = ItemDefinition.authorPayload(
    "item",
    input(),
    conformance(),
    prior,
  );
  assert.deepEqual(unchanged.components.traits, prior.components.traits);
  assert.deepEqual(unchanged.components.vehicle, prior.components.vehicle);
  const edited = ItemDefinition.authorPayload(
    "item",
    {
      ...input(),
      traits: [],
      actions: [],
      vehicle: null,
    },
    conformance(),
    prior,
  );
  assert.deepEqual(edited.components.traits, []);
  assert.deepEqual(edited.components.actions, []);
  assert.equal(Object.hasOwn(edited.components, "vehicle"), false);
  assert.deepEqual(edited.components.crafting, prior.components.crafting);
  const replacement = { ...prior.components.vehicle, hitPoints: 60 };
  const updated = ItemDefinition.authorPayload(
    "item",
    {
      ...input(),
      vehicle: replacement,
      actions: [ownedAction({ activation: "reaction" })],
    },
    conformance(),
    prior,
  );
  assert.deepEqual(updated.components.vehicle, replacement);
  assert.equal(updated.components.actions[0].components.activation, "reaction");
  assert.deepEqual(prior.components.actions[0].components.activation, "action");
});

test("mechanics-only Item authoring preserves canonical private metadata while description can be cleared", () => {
  const prior = {
    ...payload(),
    identity: {
      ...payload().identity,
      description: "Existing description",
      tags: ["secret"],
      gmNotes: { text: "Keep identity secret" },
    },
    gmDescription: "Private canonical top-level data",
    futureField: { value: [1, 2] },
    extensions: { "world:private": { text: "Keep extension" } },
  };
  const edited = ItemDefinition.authorPayload(
    "item",
    {
      ...input(),
      description: prior.identity.description,
      actions: [ownedAction()],
    },
    conformance(),
    prior,
  );
  assert.deepEqual(edited.identity, prior.identity);
  assert.equal(edited.gmDescription, prior.gmDescription);
  assert.deepEqual(edited.futureField, prior.futureField);
  assert.deepEqual(edited.extensions, prior.extensions);
  const cleared = ItemDefinition.authorPayload(
    "item",
    { ...input(), description: " " },
    conformance(),
    edited,
  );
  assert.equal(Object.hasOwn(cleared.identity, "description"), false);
  assert.deepEqual(cleared.identity.tags, ["secret"]);
  assert.deepEqual(cleared.identity.gmNotes, prior.identity.gmNotes);
});

test("Item propagates nested Action effect field diagnostics through Trait ownership", () => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        actions: [
          {
            kind: "action",
            components: {
              activation: "action",
              outcomes: [
                {
                  id: "hit",
                  effects: [
                    {
                      kind: "move",
                      target: "self",
                      distance: { value: 1, unit: "invalid" },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  ];
  const item = ItemDefinition.deserialize(data, context());
  assert.ok(
    item.state.metadata.validity.issues.some(
      (issue) =>
        issue.path ===
          "components.traits[0].components.actions[0].components.outcomes[0].effects[0].distance.unit" &&
        !issue.unresolved,
    ),
  );
  assert.deepEqual(item.serializePayload(), data);
  item.dispose();
});

test("Item propagates indexed invalid and unresolved costs through every Action owner", () => {
  for (const owner of ["direct", "trait", "vehicle"]) {
    const action = {
      kind: "action",
      components: {
        activation: "action",
        outcomes: [],
        costs: [{ kind: "capacity", band: false }, { kind: "hit-die" }],
      },
    };
    const data = payload();
    let path;
    if (owner === "direct") {
      data.components.actions = [action];
      path = "components.actions[0]";
    } else if (owner === "trait") {
      data.components.traits = [
        { kind: "trait", components: { actions: [action] } },
      ];
      path = "components.traits[0].components.actions[0]";
    } else {
      data.components.vehicle = { actions: [action] };
      path = "components.vehicle.actions[0]";
    }
    const item = ItemDefinition.deserialize(data, context());
    const issues = item.state.metadata.validity.issues;
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `${path}.components.costs[0].band` &&
          !issue.unresolved,
      ),
      owner,
    );
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `${path}.components.costs[1].amount` &&
          issue.unresolved,
      ),
      owner,
    );
    assert.deepEqual(item.serializePayload(), data);
    item.dispose();
  }
});

test("Item propagates indexed invalid and unresolved prerequisites through every Action owner", () => {
  for (const owner of ["direct", "trait", "vehicle"]) {
    const action = {
      kind: "action",
      components: {
        activation: "action",
        outcomes: [],
        prerequisites: [
          { kind: "visible", observer: false, target: "self" },
          { kind: "is-sustaining-operation" },
        ],
      },
    };
    const data = payload();
    let path;
    if (owner === "direct") {
      data.components.actions = [action];
      path = "components.actions[0]";
    } else if (owner === "trait") {
      data.components.traits = [
        { kind: "trait", components: { actions: [action] } },
      ];
      path = "components.traits[0].components.actions[0]";
    } else {
      data.components.vehicle = { actions: [action] };
      path = "components.vehicle.actions[0]";
    }
    const item = ItemDefinition.deserialize(data, context());
    const issues = item.state.metadata.validity.issues;
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `${path}.components.prerequisites[0].observer` &&
          !issue.unresolved,
      ),
      owner,
    );
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `${path}.components.prerequisites[1].subject` &&
          issue.unresolved,
      ),
      owner,
    );
    assert.deepEqual(item.serializePayload(), data);
    item.dispose();
  }
});

test("Item propagates Trait-owned invalid and unresolved prerequisite metadata", () => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        prerequisites: [
          {
            kind: "all",
            predicates: [
              { kind: "has-tag", subject: false },
              {
                kind: "not",
                predicate: { kind: "has-definition", subject: "" },
              },
            ],
          },
        ],
      },
    },
  ];
  const entity = ItemDefinition.deserialize(data, context());
  const issues = entity.state.metadata.validity.issues;
  const path = "components.traits[0].components.prerequisites[0].predicates";
  assert.ok(
    issues.some(
      (issue) =>
        issue.code.endsWith("trait-prerequisite-invalid") &&
        issue.path === `${path}[0].subject` &&
        !issue.unresolved,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code.endsWith("trait-prerequisite-unresolved") &&
        issue.path === `${path}[1].predicate.definitionId` &&
        issue.unresolved,
    ),
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item propagates Trait Choice/Option structural and recursive prerequisite diagnostics", () => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        choices: [
          {
            id: "c",
            prompt: "Choose",
            minimum: false,
            maximum: 1,
            options: [
              { id: "o", prerequisites: [{ kind: "has-tag", subject: false }] },
            ],
          },
        ],
      },
    },
  ];
  const entity = ItemDefinition.deserialize(data, context());
  const issues = entity.state.metadata.validity.issues;
  const path = "components.traits[0].components.choices[0]";
  assert.ok(
    issues.some(
      (issue) =>
        issue.code.endsWith("trait-choice-invalid") &&
        issue.path === `${path}.minimum`,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code.endsWith("trait-choice-unresolved") &&
        issue.path === `${path}.options[0].value` &&
        issue.unresolved,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code.endsWith("trait-prerequisite-invalid") &&
        issue.path === `${path}.options[0].prerequisites[0].subject`,
    ),
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item propagates Trait modifier diagnostics and retains authored data", () => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        modifiers: [
          {
            id: "m",
            operation: "add",
            value: { kind: "path", path: false },
            predicate: {
              kind: "not",
              predicate: { kind: "has-tag", subject: false },
            },
          },
        ],
      },
    },
  ];
  const entity = ItemDefinition.deserialize(data, context());
  for (const [field, suffix] of [
    ["target", "unresolved"],
    ["value.path", "invalid"],
    ["predicate.predicate.subject", "invalid"],
    ["predicate.predicate.tag", "unresolved"],
  ]) {
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.code.endsWith(`trait-modifier-${suffix}`) &&
          issue.path ===
            `components.traits[0].components.modifiers[0].${field}`,
      ),
    );
  }
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item propagates owned Trait trigger and effect diagnostics without changing payloads", () => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        triggers: [
          { event: "hit", effects: [{ kind: "damage", target: 1 }] },
          {},
        ],
      },
    },
  ];
  const entity = ItemDefinition.deserialize(data, context());
  for (const [path, code] of [
    ["[0].effects[0].target", "trait-effect-invalid"],
    ["[0].effects[0].amount", "trait-effect-unresolved"],
    ["[1].event", "trait-trigger-unresolved"],
    ["[1].effects", "trait-trigger-unresolved"],
  ])
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.path === `components.traits[0].components.triggers${path}` &&
          issue.code.endsWith(code),
      ),
      path,
    );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Item propagates Trait usage-limit invalid and unresolved diagnostics", () => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        triggers: [
          {
            event: "hit",
            effects: [],
            limit: { kind: "uses", maximum: { kind: "path", fallback: false } },
          },
        ],
      },
    },
  ];
  const entity = ItemDefinition.deserialize(data, context());
  for (const [field, suffix] of [
    ["path", "unresolved"],
    ["fallback", "invalid"],
  ])
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.code.endsWith(`trait-trigger-${suffix}`) &&
          issue.path ===
            `components.traits[0].components.triggers[0].limit.maximum.${field}`,
      ),
    );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Vehicle target resolution preserves references and distinguishes draft diagnostics from publication blocking", () => {
  const data = withVehicle({ ...vehicle(), components: ["part"] });
  const draft = ItemDefinition.deserializePayload(data, {
    ...context(),
    mode: "draft",
  });
  const publication = ItemDefinition.deserializePayload(data, context());
  assert.equal(vehicleIssues(draft)[0].blocking, false);
  assert.equal(vehicleIssues(publication)[0].blocking, true);
  assert.deepEqual(draft.serializePayload(), data);
  publication.validate({
    ...context(),
    definitionIds: ["part"],
    records: [
      {
        resourceType: "definitions",
        sourceId: "part",
        payload: { kind: "action" },
      },
    ],
  });
  assert.deepEqual(vehicleIssues(publication), []);
  publication.validate({
    ...context(),
    definitionIds: [],
    records: [
      {
        resourceType: "definitions",
        sourceId: "part",
        payload: { kind: "item" },
      },
    ],
  });
  assert.equal(vehicleIssues(publication)[0].blocking, true);
  draft.dispose();
  publication.dispose();
});
