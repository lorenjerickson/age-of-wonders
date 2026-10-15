import assert from "node:assert/strict";
import test from "node:test";
import {
  ItemDefinition,
  CharacterDefinition,
  MonsterDefinition,
} from "../dist/index.js";
const constant = { kind: "constant", value: 2 };
const dice = { terms: [{ kind: "dice", count: 1, size: 6 }] };
const malformed = (entity) =>
  entity.state.metadata.validity.issues.filter((i) => !i.unresolved);
const item = (components) =>
  ItemDefinition.deserializePayload({ kind: "item", components });
const monster = (overrides) => ({
  kind: "monster",
  identity: { id: "catalog", name: "Sentinel" },
  components: {
    size: "large",
    classification: { nature: "custom", aliases: [] },
    defenseRating: dice,
    hitPoints: { average: 12, formula: dice },
    speeds: [],
    attributes: { "home:will": 50 },
    challengeRating: "1/2",
    actions: [],
    ...overrides,
  },
  extensions: { "home:private": { secret: true } },
});
test("Item recursively diagnoses its mechanics with precise owned paths and preserves extensions", () => {
  const entity = item({
    prerequisites: [
      {
        kind: "compare",
        left: { kind: "literal", value: 1 },
        operator: "eq",
        right: { kind: "literal", value: 1 },
      },
    ],
    modifiers: [
      {
        id: "m",
        target: "x",
        operation: "add",
        value: { kind: "literal", value: 1 },
      },
    ],
    attunement: { required: true, prerequisites: [] },
    capacity: { maximum: constant, recharge: { timing: "dawn", amount: dice } },
    crafting: {
      time: constant,
      ingredients: [
        {
          quantity: { kind: "literal", value: 2 },
          consumed: false,
          private: true,
        },
      ],
      produces: [{ itemId: "blade", quantity: constant }],
    },
  });
  assert.equal(
    entity.state.metadata.validity.issues.filter((i) =>
      i.code.startsWith("item-mechanics"),
    ).length,
    0,
  );
  assert.equal(
    entity.serializePayload().components.crafting.ingredients[0].private,
    true,
  );
  entity.dispose();
  for (const [components, path] of [
    [
      { capacity: { maximum: { kind: "constant", value: "many" } } },
      "components.capacity.maximum.value",
    ],
    [
      {
        crafting: {
          time: constant,
          produces: [
            { itemId: "x", quantity: { kind: "constant", value: false } },
          ],
        },
      },
      "components.crafting.produces[0].quantity.value",
    ],
    [{ attunement: { required: "yes" } }, "components.attunement.required"],
  ]) {
    const e = item(components);
    assert.ok(
      malformed(e).some((i) => i.path === path),
      path,
    );
    e.dispose();
  }
});
test("catalog Character validates choices and rolled attribute dice without changing data", () => {
  const payload = {
    kind: "character-template",
    components: {
      attributeDefaults: {},
      choices: [
        {
          id: "c",
          prompt: "Pick",
          minimum: 1,
          maximum: 1,
          options: [
            {
              id: "o",
              label: "One",
              value: { private: [1, true] },
              prerequisites: [
                {
                  kind: "custom",
                  handler: "home:gate",
                  payload: { opaque: true },
                },
              ],
            },
          ],
        },
      ],
      attributeGeneration: { kind: "roll", expression: dice, count: 3 },
    },
  };
  const e = CharacterDefinition.deserializePayload(payload);
  assert.equal(malformed(e).length, 0);
  assert.deepEqual(e.serializePayload(), payload);
  e.dispose();
  payload.components.attributeGeneration.expression = {
    terms: [{ kind: "dice", count: "many", size: 6 }],
  };
  const bad = CharacterDefinition.deserializePayload(payload);
  assert.ok(
    malformed(bad).some(
      (i) =>
        i.path === "components.attributeGeneration.expression.terms[0].count",
    ),
  );
  bad.dispose();
});
test("Monster has a distinct codec and owns all Action and Trait collections", () => {
  const p = monster({});
  const e = MonsterDefinition.deserializePayload(p);
  assert.equal(malformed(e).length, 0);
  assert.deepEqual(
    MonsterDefinition.deserialize(e.serialize()).serializePayload(),
    p,
  );
  assert.throws(() =>
    MonsterDefinition.deserializePayload({ kind: "creature" }),
  );
  e.dispose();
  for (const key of [
    "traits",
    "regionalEffects",
    "actions",
    "bonusActions",
    "reactions",
    "legendaryActions",
    "mythicActions",
    "lairActions",
  ]) {
    const e = MonsterDefinition.deserializePayload(monster({ [key]: [null] }));
    assert.ok(malformed(e).some((i) => i.path === `components.${key}[0]`));
    e.dispose();
  }
});
test("Monster mechanics preserve open vocabulary and diagnose nested predicates, dice, and source expressions", () => {
  const p = monster({
    skills: [{ skillDefinitionId: "s", bonus: 4 }],
    speeds: [
      {
        mode: "home:float",
        distance: { value: 5, unit: "meter" },
        restrictions: [{ kind: "custom", handler: "home:fly" }],
      },
    ],
    damageAdjustments: [
      { damageType: "home:heat", response: "reduction", amount: constant },
    ],
    senses: [{ sense: "home:heat", range: { value: 4, unit: "meter" } }],
    communicationCapabilities: [
      {
        medium: "home:signal",
        directionality: "broadcast",
        operatingBasis: "home:field",
        understanding: "home:known",
      },
    ],
    disciplines: {
      sources: [
        {
          id: "s",
          sourceDefinitionId: "d",
          attribute: "home:will",
          accessMode: "home:trained",
          targetingBonus: constant,
          resistanceDifficulty: constant,
        },
      ],
    },
  });
  const e = MonsterDefinition.deserializePayload(p);
  assert.equal(malformed(e).length, 0);
  assert.deepEqual(e.serializePayload(), p);
  e.dispose();
  p.components.disciplines.sources[0].targetingBonus = {
    kind: "constant",
    value: "bad",
  };
  const bad = MonsterDefinition.deserializePayload(p);
  assert.ok(
    malformed(bad).some(
      (i) =>
        i.path === "components.disciplines.sources[0].targetingBonus.value",
    ),
  );
  bad.dispose();
});
