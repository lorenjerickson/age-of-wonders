import assert from "node:assert/strict";
import test from "node:test";
import { EffectDefinition, ConditionDefinition } from "../dist/index.js";

const modifier = () => ({
  id: "speed",
  propertyPath: "movement.walk",
  operation: "add",
  value: 5,
  allowConditionOverride: true,
});
const effect = () => ({
  id: "effect",
  name: "Haste",
  revision: 1,
  modifiers: [modifier()],
  duration: { kind: "permanent" },
});
const condition = () => ({
  id: "condition",
  name: "Quick",
  revision: 1,
  effects: [{ effectId: "effect", modifierOverrides: { speed: 10 } }],
});
const record = (payload = effect()) => ({
  resourceType: "world-effects",
  sourceId: "effect",
  payload,
});
const context = (records = [record()]) => ({ mode: "publication", records });
const valid = (entity) => entity.state.metadata.validity.status === "valid";
const messages = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.message);

test("Effect and Condition codecs preserve durations, extensions and private descriptions", () => {
  for (const [Class, data] of [
    [EffectDefinition, effect()],
    [ConditionDefinition, condition()],
  ]) {
    data.description = "Private authoring notes";
    data.extensions = { "world:future": { preserved: [1, 2] } };
    if (data.modifiers)
      data.modifiers[0].duration = {
        kind: "timed",
        amount: 0.5,
        unit: "rounds",
      };
    const entity = Class.deserialize(data, context());
    assert(valid(entity));
    assert.deepEqual(
      Class.deserialize(entity.serialize(), context()).serializePayload(),
      data,
    );
    const encoded = entity.serializePayload();
    encoded.extensions["world:future"].preserved.push(3);
    assert.deepEqual(
      entity.state.data.extensions["world:future"].preserved,
      [1, 2],
    );
  }
});

test("Effect numeric paths resolve against scoped Character, Creature and Skill records", () => {
  const records = [
    {
      resourceType: "world-character-templates",
      sourceId: "npc",
      payload: { attributes: { "world:strength": 2 } },
    },
    {
      resourceType: "definitions",
      sourceId: "creature",
      payload: { kind: "creature", components: { skills: { tracking: 3 } } },
    },
    {
      resourceType: "definitions",
      sourceId: "skill",
      payload: { kind: "skill", identity: { key: "world:stealth" } },
    },
  ];
  for (const propertyPath of [
    "health.current",
    "vision.night",
    "movement.jump",
    "attributes.world:strength.value",
    "skills.tracking.modifier",
    "skills.skill.value",
    "skills.world:stealth.modifier",
  ]) {
    assert(
      valid(
        EffectDefinition.deserialize(
          { ...effect(), modifiers: [{ ...modifier(), propertyPath }] },
          context(records),
        ),
      ),
      propertyPath,
    );
  }
  const scoped = {
    ...effect(),
    modifiers: [
      { ...modifier(), propertyPath: "attributes.world:strength.value" },
    ],
  };
  assert(!valid(EffectDefinition.deserialize(scoped, context([]))));
  assert.equal(
    EffectDefinition.deserialize(scoped).state.metadata.validity.status,
    "unresolved",
  );
});

test("Effect rejects unsafe paths, duplicate modifiers and invalid numeric operations", () => {
  for (const patch of [
    { propertyPath: "attributes.__proto__.value" },
    { propertyPath: "health.constructor" },
    { propertyPath: "prototype.value" },
    { propertyPath: "name" },
    { operation: "divide" },
    { allowConditionOverride: "yes" },
    { unit: " " },
  ])
    assert(
      !valid(
        EffectDefinition.deserialize(
          { ...effect(), modifiers: [{ ...modifier(), ...patch }] },
          context(),
        ),
      ),
    );
  assert(
    !valid(
      EffectDefinition.deserialize(
        { ...effect(), modifiers: [modifier(), modifier()] },
        context(),
      ),
    ),
  );
  assert(
    !valid(
      EffectDefinition.deserialize({ ...effect(), modifiers: [] }, context()),
    ),
  );
});

test("Effect duration validation retains required default and optional independent positive durations", () => {
  for (const unit of ["rounds", "minutes", "hours", "days"]) {
    assert(
      valid(
        EffectDefinition.deserialize(
          { ...effect(), duration: { kind: "timed", amount: 0.5, unit } },
          context(),
        ),
      ),
    );
  }
  for (const duration of [
    { kind: "timed", amount: 0, unit: "rounds" },
    { kind: "timed", amount: -1, unit: "hours" },
    { kind: "timed", amount: 2, unit: "years" },
  ]) {
    assert(
      !valid(
        EffectDefinition.deserialize({ ...effect(), duration }, context()),
      ),
    );
    assert(
      !valid(
        EffectDefinition.deserialize(
          { ...effect(), modifiers: [{ ...modifier(), duration }] },
          context(),
        ),
      ),
    );
  }
  const missing = effect();
  delete missing.duration;
  assert(!valid(EffectDefinition.deserialize(missing, context())));
});

test("Condition owns reference checks while Effect owns override permission", () => {
  assert(valid(ConditionDefinition.deserialize(condition(), context())));
  assert(!valid(ConditionDefinition.deserialize(condition(), context([]))));
  assert.equal(
    ConditionDefinition.deserialize(condition()).state.metadata.validity.status,
    "unresolved",
  );
  const denied = record({
    ...effect(),
    modifiers: [{ ...modifier(), allowConditionOverride: false }],
  });
  assert(
    messages(
      ConditionDefinition.deserialize(condition(), context([denied])),
    ).includes("This Effect modifier does not allow a Condition override."),
  );
  assert.equal(
    EffectDefinition.deserialize(effect(), context()).permitsOverride("speed"),
    true,
  );
  assert.equal(
    EffectDefinition.deserialize(effect(), context()).permitsOverride(
      "missing",
    ),
    false,
  );
});

test("Condition keeps partial referenced Effect compatibility and does not assert its full validity", () => {
  const partial = {
    modifiers: [{ id: "speed", allowConditionOverride: true }],
  };
  assert(
    valid(
      ConditionDefinition.deserialize(condition(), context([record(partial)])),
    ),
  );
  assert(
    valid(
      ConditionDefinition.deserialize(
        { ...condition(), effects: [] },
        context([]),
      ),
    ),
  );
});

test("Condition rejects duplicate Effects, unknown overrides and unsafe numeric maps", () => {
  const data = condition();
  data.effects.push(data.effects[0]);
  assert(!valid(ConditionDefinition.deserialize(data, context())));
  for (const modifierOverrides of [
    { missing: 2 },
    { speed: "2" },
    JSON.parse('{"__proto__":2}'),
  ]) {
    assert(
      !valid(
        ConditionDefinition.deserialize(
          {
            ...condition(),
            effects: [{ effectId: "effect", modifierOverrides }],
          },
          context(),
        ),
      ),
    );
  }
});

test("Revalidating a Condition emits metadata when an Effect override permission changes", () => {
  const entity = ConditionDefinition.deserialize(condition(), context());
  const states = [];
  entity.state$.subscribe((state) => states.push(state));
  entity.validate(
    context([
      record({
        ...effect(),
        modifiers: [{ ...modifier(), allowConditionOverride: false }],
      }),
    ]),
  );
  assert.equal(states.length, 2);
  assert.equal(states[1].metadata.validity.status, "invalid");
  assert.equal(states[0].data, states[1].data);
  entity.validate(context());
  assert.equal(states.length, 3);
  assert.equal(states[2].metadata.validity.status, "valid");
});

test("Effect and Condition rename commands publish state before named events", async () => {
  for (const [Class, data] of [
    [EffectDefinition, effect()],
    [ConditionDefinition, condition()],
  ]) {
    const entity = Class.deserialize(data, context());
    const order = [];
    entity.state$.subscribe((state) => order.push(state.data.name));
    entity.events.renamed.listen((event) => order.push(event.context.name));
    const invocation = {
      initiator: "author",
      params: { name: " Renamed " },
      context: {},
    };
    assert.equal(
      (await entity.command("rename", invocation)).status,
      "committed",
    );
    assert.deepEqual(order, [data.name, "Renamed", "Renamed"]);
    assert.equal(
      (await entity.command("rename", invocation)).status,
      "unchanged",
    );
  }
});

test("Codex entity decoders reject malformed JSON and versions, without trusting encoded validity", () => {
  for (const [Class, data, type] of [
    [EffectDefinition, effect(), "effect-definition"],
    [ConditionDefinition, condition(), "condition-definition"],
  ]) {
    for (const value of [
      null,
      [],
      { ...data, undefinedField: undefined },
      { ...data, bad: Infinity },
      { type, schemaVersion: 99, data },
    ])
      assert.throws(() => Class.deserialize(value, context()));
    const encoded = Class.deserialize(data, context()).serialize();
    encoded.metadata = { validity: { status: "valid" } };
    encoded.data.name = "";
    assert(!valid(Class.deserialize(encoded, context())));
  }
});
