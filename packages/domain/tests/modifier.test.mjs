import assert from "node:assert/strict";
import test from "node:test";
import {
  Modifier,
  ProfessionDefinition,
  BackgroundDefinition,
} from "../dist/index.js";
import {
  isModifierGrantDefinition,
  professionModifierGrantIssue,
  backgroundModifierGrantIssue,
  skillModifierGrantIssue,
} from "@aow/common";

const recipe = () => ({
  id: "might",
  label: "Might",
  kind: "rolled-flat",
  stacking: "add",
  dice: [{ count: 1, sides: 6 }],
  target: { kind: "attribute", attribute: "core:strength" },
});
const status = (payload) => {
  const entity = Modifier.deserializePayload(payload);
  try {
    return entity.state.metadata.validity.status;
  } finally {
    entity.dispose();
  }
};

test("Modifier codecs preserve recipe extensions and isolate state and serialized copies", () => {
  const data = { ...recipe(), extensions: { "test:note": ["authored"] } };
  const entity = Modifier.deserializePayload(data);
  data.dice[0].sides = 20;
  assert.equal(entity.state.data.dice[0].sides, 6);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const encoded = entity.serialize();
  assert.equal(encoded.type, "modifier");
  const restored = Modifier.deserialize(encoded);
  assert.deepEqual(restored.serializePayload(), entity.serializePayload());
  encoded.data.extensions["test:note"].push("changed");
  assert.deepEqual(restored.state.data.extensions["test:note"], ["authored"]);
  assert.throws(() => {
    entity.state.data.label = "external";
  }, TypeError);
  restored.dispose();
  entity.dispose();
});

test("Modifier preserves all recipe kinds and targets from the common contract", () => {
  const targets = [
    { kind: "attribute", attribute: "custom:might" },
    { kind: "health-maximum" },
    { kind: "speed", movementMode: "custom:glide", unit: "hex" },
    { kind: "skill-check", skillDefinitionId: "tracking" },
    ...["hit", "defense", "damage"].map((roll) => ({ kind: "roll", roll })),
    { kind: "statistic", key: "custom:luck" },
    { kind: "attribute", attribute: "bad" },
    { kind: "speed", movementMode: "walk", unit: "yards" },
    { kind: "roll", roll: "healing" },
    { kind: "skill-check", skillDefinitionId: "" },
  ];
  for (const kind of [
    "rolled-flat",
    "roll-dice",
    "skill-proficiency",
    "unknown",
  ]) {
    for (const target of targets) {
      const data = { ...recipe(), kind, target };
      assert.equal(
        status(data) === "valid",
        isModifierGrantDefinition(data),
        JSON.stringify({ kind, target }),
      );
    }
  }
});

test("Modifier rejects malformed dice and preserves exact physical dice bounds", () => {
  for (const dice of [
    [],
    [{ count: 0, sides: 6 }],
    [{ count: 101, sides: 6 }],
    [{ count: 1.5, sides: 6 }],
    [{ count: 1, sides: 1 }],
    [{ count: 1, sides: 10001 }],
    [{ count: 1, sides: 2.5 }],
    Array(33).fill({ count: 1, sides: 6 }),
    "dice",
    null,
  ]) {
    assert.equal(status({ ...recipe(), dice }), "invalid");
  }
  assert.equal(
    status({ ...recipe(), dice: Array(32).fill({ count: 100, sides: 10000 }) }),
    "valid",
  );
  for (const change of [
    { id: "" },
    { label: " " },
    { stacking: "replace" },
    { target: null },
  ])
    assert.equal(status({ ...recipe(), ...change }), "invalid");
});

test("Modifier collection adapters preserve messages, duplicate scopes, and legacy omissions", () => {
  const cases = [
    undefined,
    null,
    {},
    { expertiseLevels: [] },
    { expertiseLevels: "bad" },
    { expertiseLevels: [{ benefits: {} }] },
    ...[
      null,
      "bad",
      [],
      [recipe()],
      [recipe(), recipe()],
      [{ ...recipe(), stacking: "bad" }],
      Array(129).fill(recipe()),
    ].map((modifierGrants) => ({
      expertiseLevels: [{ benefits: { modifierGrants } }],
    })),
    {
      expertiseLevels: [
        { benefits: { modifierGrants: [recipe()] } },
        { benefits: { modifierGrants: [recipe()] } },
      ],
    },
    {
      expertiseLevels: [
        {
          benefits: {
            modifierGrants: [recipe(), { ...recipe(), id: "other" }],
          },
        },
      ],
    },
  ];
  for (const components of cases) {
    const entity = ProfessionDefinition.deserializePayload({
      kind: "profession",
      components: components ?? {},
    });
    try {
      assert.equal(
        entity.state.metadata.validity.issues.find(
          (issue) => issue.code === "profession-canonical-components",
        )?.message,
        professionModifierGrantIssue(components),
      );
    } finally {
      entity.dispose();
    }
  }
  for (const modifierGrants of [
    [],
    null,
    "bad",
    [recipe()],
    [recipe(), recipe()],
    [{ ...recipe(), kind: "bad" }],
  ]) {
    assert.equal(
      backgroundIssue({ modifierGrants }),
      backgroundModifierGrantIssue({ modifierGrants }),
    );
    assert.equal(
      Modifier.grantListIssue(modifierGrants, "Skill"),
      skillModifierGrantIssue({ modifierGrants }),
    );
  }
  assert.equal(backgroundIssue({}), undefined);
});

test("Modifier publishes renamed state before events and supports teardown", async () => {
  const entity = Modifier.deserializePayload(recipe());
  const seen = [];
  const sub = entity.state$.subscribe((state) =>
    seen.push(`state:${state.data.label}`),
  );
  const off = entity.events.renamed.listen((event) => {
    seen.push(`event:${event.context.label}`);
    assert.equal(entity.state.data.label, event.context.label);
  });
  const receipt = await entity.command("rename", {
    initiator: "editor",
    params: { label: " Strong " },
    context: {},
  });
  assert.equal(receipt.status, "committed");
  assert.deepEqual(seen, ["state:Might", "state:Strong", "event:Strong"]);
  assert.equal(
    (
      await entity.command("rename", {
        initiator: null,
        params: { label: "Strong" },
        context: {},
      })
    ).status,
    "unchanged",
  );
  await assert.rejects(
    entity.command("rename", {
      initiator: null,
      params: { label: " " },
      context: {},
    }),
    /valid Modifier label/,
  );
  off();
  sub.unsubscribe();
  entity.dispose();
});

test("Modifier raw decoding does not unwrap envelope-shaped authored payloads", () => {
  const encoded = { type: "modifier", schemaVersion: 1, data: recipe() };
  assert.equal(status(encoded), "invalid");
  const entity = Modifier.deserialize(encoded);
  assert.equal(entity.state.metadata.validity.status, "valid");
  entity.dispose();
  assert.throws(
    () => Modifier.deserialize({ ...encoded, schemaVersion: 2 }),
    /version/,
  );
  const circular = {};
  circular.self = circular;
  for (const input of [
    null,
    [],
    new Date(),
    circular,
    { value: Infinity },
    { value: () => 1 },
  ])
    assert.throws(() => Modifier.deserializePayload(input), /JSON object/);
});

function backgroundIssue(components) {
  const entity = BackgroundDefinition.deserializePayload({
    kind: "background",
    components,
  });
  try {
    return entity.state.metadata.validity.issues.find(
      (issue) => issue.code === "background-canonical-components",
    )?.message;
  } finally {
    entity.dispose();
  }
}
